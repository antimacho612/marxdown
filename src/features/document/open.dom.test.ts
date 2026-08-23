// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useRecentStore } from '@/features/workspace/recent'
import type { MarkdownParser } from '@/markdown/worker/client'
import type { ParseResponse } from '@/markdown/worker/protocol'
import {
  getPlatform,
  setPlatform,
  type DocumentPayload,
  type Platform,
  type RecentEntry,
} from '@/platform'

import { configureOpener, openDocument, openDropped, openPath, openViaDialog } from './open'
import { useDocumentStore } from './store'

const original = getPlatform()

function payload(path: string, content = '# hello\n\ntext\n'): DocumentPayload {
  return {
    path,
    content,
    eol: 'lf',
    bom: false,
    encoding: 'utf8',
    mtimeMs: 1,
    size: content.length,
    readonly: false,
  }
}

/** Worker を立てずに `MarkdownParser` の形だけ満たす。 */
function fakeParser(): MarkdownParser {
  return {
    parse: (text) =>
      Promise.resolve({
        type: 'parsed' as const,
        id: 1,
        chunks: [`<p>${text.length}</p>`],
        outline: [{ level: 1, text: 'hello', slug: 'hello', line: 0 }],
        frontMatter: null,
        parseMs: 0.5,
        textStats: { chars: text.length, words: 2, readingMinutes: 1 },
      }),
    dispose: () => {},
  }
}

interface Spies {
  readDocument: ReturnType<typeof vi.fn>
  pushRecent: ReturnType<typeof vi.fn>
  removeRecent: ReturnType<typeof vi.fn>
  pickFile: ReturnType<typeof vi.fn>
}

function install(overrides: Partial<Platform> = {}): Spies {
  const spies: Spies = {
    readDocument: vi.fn((path: string) => Promise.resolve(payload(path))),
    pushRecent: vi.fn((path: string) =>
      Promise.resolve([{ path, openedAtMs: 1 }] as RecentEntry[]),
    ),
    removeRecent: vi.fn(() => Promise.resolve([] as RecentEntry[])),
    pickFile: vi.fn(() => Promise.resolve(null)),
  }
  setPlatform({ ...original, ...spies, ...overrides } as Platform)
  return spies
}

/** `openDocument` は次の rAF を待つ。jsdom には無いので即時に回す。 */
beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0)
    return 0
  })
  vi.stubGlobal('requestIdleCallback', undefined)

  document.body.innerHTML = '<div id="mx-preview"></div>'
  useDocumentStore.setState({
    meta: null,
    outline: [],
    frontMatter: null,
    notice: null,
    stats: null,
  })
  useRecentStore.setState({ entries: [] })

  configureOpener({ parser: fakeParser(), site: 'worker' })
})

afterEach(() => {
  setPlatform(original)
  vi.unstubAllGlobals()
})

describe('開く経路の集約 (F-OPEN-01, 05, 07, 08)', () => {
  it('読み込み → パース → 描画 → 派生状態の更新まで一度に進む', async () => {
    install()

    const outcome = await openPath('C:/work/a.md')

    expect(outcome).not.toBeNull()
    expect(useDocumentStore.getState().meta?.path).toBe('C:/work/a.md')
    expect(useDocumentStore.getState().outline).toHaveLength(1)
    expect(useDocumentStore.getState().stats?.chunks).toBe(1)
    expect(document.querySelector('#mx-preview')?.textContent).not.toBe('')
  })

  it('開いたファイルを最近開いたファイルに積む (F-OPEN-09)', async () => {
    const spies = install()

    await openPath('C:/work/a.md')

    expect(spies.pushRecent).toHaveBeenCalledWith('C:/work/a.md')
    expect(useRecentStore.getState().entries[0]?.path).toBe('C:/work/a.md')
  })

  it('remember: false なら履歴に積まない', async () => {
    const spies = install()

    await openDocument(payload('C:/work/a.md'), { remember: false })

    expect(spies.pushRecent).not.toHaveBeenCalled()
  })

  it('前の通知は開いた時点で消える', async () => {
    install()
    useDocumentStore.getState().setNotice({ level: 'error', message: '前のエラー' })

    await openPath('C:/work/a.md')

    expect(useDocumentStore.getState().notice).toBeNull()
  })

  it('開けなかったら通知を出し、本文は差し替えない', async () => {
    install({
      readDocument: vi.fn(() => Promise.reject({ kind: 'permission-denied', message: 'x' })),
    })

    const outcome = await openPath('C:/work/secret.md')

    expect(outcome).toBeNull()
    expect(useDocumentStore.getState().meta).toBeNull()
    expect(useDocumentStore.getState().notice?.level).toBe('error')
    expect(useDocumentStore.getState().notice?.message).toContain('C:/work/secret.md')
  })

  it('消えたファイルは履歴から外す（次の起動で同じ失敗を踏まないため）', async () => {
    const spies = install({
      readDocument: vi.fn(() => Promise.reject({ kind: 'not-found', message: 'x' })),
    })

    await openPath('C:/work/gone.md')

    expect(spies.removeRecent).toHaveBeenCalledWith('C:/work/gone.md')
  })

  it('読めなかっただけのファイルは履歴に残す', async () => {
    const spies = install({
      readDocument: vi.fn(() => Promise.reject({ kind: 'permission-denied', message: 'x' })),
    })

    await openPath('C:/work/locked.md')

    expect(spies.removeRecent).not.toHaveBeenCalled()
  })
})

describe('起動シーケンスとの重ね合わせ (02.architecture.md §5.1)', () => {
  it('シェル描画はパース送信の後、描画結果を待つ前に呼ばれる', async () => {
    install()
    const order: string[] = []

    // lib は ES2023 なので Promise.withResolvers は使えない
    let resolveParse!: (r: ParseResponse) => void
    const parsed = new Promise<ParseResponse>((resolve) => {
      resolveParse = resolve
    })
    configureOpener({
      parser: {
        parse: () => {
          order.push('parse-posted')
          return parsed
        },
        dispose: () => {},
      },
      site: 'worker',
    })

    const opening = openDocument(payload('C:/work/a.md'), {
      betweenParseAndPaint: () => order.push('shell'),
    })

    // ここまでで、パースは投げ終わっていてシェルも描かれている
    expect(order).toEqual(['parse-posted', 'shell'])

    resolveParse({
      type: 'parsed',
      id: 1,
      chunks: ['<p>x</p>'],
      outline: [],
      frontMatter: null,
      parseMs: 0.1,
      textStats: { chars: 1, words: 1, readingMinutes: 1 },
    })
    await opening

    expect(document.querySelector('#mx-preview')?.textContent).toBe('x')
  })
})

describe('ドラッグ＆ドロップ (F-OPEN-08)', () => {
  it('複数落とされても先頭だけ開き、残りがあることを伝える', async () => {
    install()

    await openDropped(['C:/work/a.md', 'C:/work/b.md', 'C:/work/c.md'])

    expect(useDocumentStore.getState().meta?.path).toBe('C:/work/a.md')
    expect(useDocumentStore.getState().notice?.level).toBe('info')
    expect(useDocumentStore.getState().notice?.message).toContain('2')
  })

  it('1 つだけなら余計な通知を出さない', async () => {
    install()

    await openDropped(['C:/work/a.md'])

    expect(useDocumentStore.getState().notice).toBeNull()
  })

  it('空のドロップは何もしない', async () => {
    const spies = install()

    await openDropped([])

    expect(spies.readDocument).not.toHaveBeenCalled()
  })
})

describe('ファイルダイアログ (F-OPEN-07)', () => {
  it('選ばれたファイルを開く', async () => {
    const spies = install({ pickFile: vi.fn(() => Promise.resolve('C:/work/picked.md')) })

    await openViaDialog()

    expect(spies.readDocument).toHaveBeenCalledWith('C:/work/picked.md')
    expect(useDocumentStore.getState().meta?.path).toBe('C:/work/picked.md')
  })

  it('取り消しは失敗ではない。何も起きず、通知も出ない', async () => {
    const spies = install()

    const outcome = await openViaDialog()

    expect(outcome).toBeNull()
    expect(spies.readDocument).not.toHaveBeenCalled()
    expect(useDocumentStore.getState().notice).toBeNull()
  })
})
