import { beforeEach, describe, expect, it } from 'vitest'

import { useDocumentStore } from './store'

const INITIAL = useDocumentStore.getState()

beforeEach(() => {
  useDocumentStore.setState({
    meta: null,
    isDirty: false,
    outline: [],
    frontMatter: null,
    notice: null,
    stats: null,
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
    expect(keys).toEqual(['frontMatter', 'isDirty', 'meta', 'notice', 'outline', 'stats'])
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
