import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { INFO_NOTICE_MS, notifyInfo, useDocumentStore } from './store'

const INITIAL = useDocumentStore.getState()

beforeEach(() => {
  useDocumentStore.setState({
    meta: null,
    isDirty: false,
    outline: [],
    frontMatter: null,
    notice: null,
    stats: null,
    textStats: null,
  })
})

describe('ドキュメントストア (ADR-0005)', () => {
  it('本文を保持するフィールドを持たない', () => {
    // ここに content / html が生えたら ADR-0005 違反。
    // 1 打鍵ごとに巨大な文字列が React を通過し、入力レスポンス 16ms を満たせなくなる。
    const keys = Object.keys(useDocumentStore.getState()).filter(
      (k) => typeof (INITIAL as unknown as Record<string, unknown>)[k] !== 'function',
    )
    expect(keys).not.toContain('content')
    expect(keys).not.toContain('html')
    expect(keys).not.toContain('text')
    expect(keys).not.toContain('doc')
  })

  it('派生値だけを持つ', () => {
    const keys = Object.keys(useDocumentStore.getState())
      .filter((k) => typeof (INITIAL as unknown as Record<string, unknown>)[k] !== 'function')
      .toSorted()
    expect(keys).toEqual([
      'frontMatter',
      'isDirty',
      'meta',
      'notice',
      'outline',
      'stats',
      'textStats',
    ])
  })

  it('メタ情報を更新できる', () => {
    useDocumentStore.getState().setMeta({
      path: 'C:/work/a.md',
      eol: 'crlf',
      bom: true,
      encoding: 'utf8',
      mtimeMs: 1,
      size: 10,
      readonly: false,
    })
    expect(useDocumentStore.getState().meta?.eol).toBe('crlf')
  })

  it('通知はひとつだけ保持する（積み上げない）', () => {
    const { setNotice } = useDocumentStore.getState()
    setNotice({ level: 'warning', message: 'a' })
    setNotice({ level: 'error', message: 'b' })
    expect(useDocumentStore.getState().notice).toEqual({ level: 'error', message: 'b' })
  })
})

/** 03.ux-spec.md §8.2「情報は 3 秒で自動消滅、警告とエラーは消えない」。 */
describe('通知の自動消滅 (03.ux-spec.md §8.2)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('情報通知は既定の時間で消える', () => {
    notifyInfo('外部の変更を読み込みました')
    expect(useDocumentStore.getState().notice?.message).toBe('外部の変更を読み込みました')

    vi.advanceTimersByTime(INFO_NOTICE_MS)

    expect(useDocumentStore.getState().notice).toBeNull()
  })

  it('警告とエラーは消えない', () => {
    useDocumentStore.getState().setNotice({ level: 'error', message: '読み込めませんでした' })

    vi.advanceTimersByTime(INFO_NOTICE_MS * 10)

    expect(useDocumentStore.getState().notice?.message).toBe('読み込めませんでした')
  })

  it('自動消滅の待機中に差し替わったら、後から出た通知を消さない', () => {
    notifyInfo('情報')
    vi.advanceTimersByTime(INFO_NOTICE_MS - 1)
    useDocumentStore.getState().setNotice({ level: 'error', message: 'エラー' })

    vi.advanceTimersByTime(INFO_NOTICE_MS * 2)

    expect(useDocumentStore.getState().notice?.message).toBe('エラー')
  })

  it('タイマーは 1 本しか走らない（ポーリングにしない / §4.5）', () => {
    notifyInfo('a')
    notifyInfo('b')
    notifyInfo('c')
    expect(vi.getTimerCount()).toBe(1)
  })
})
