import { afterEach, describe, expect, it } from 'vitest'

import { getPlatform, setPlatform, type Platform } from './index'

const original = getPlatform()

afterEach(() => {
  setPlatform(original)
})

/** Domain 層が Tauri を知らないことを構造で担保する（02.architecture.md §3.1）。 */
describe('Platform 層', () => {
  it('Tauri の外では web 実装が選ばれる', () => {
    expect(getPlatform().kind).toBe('web')
  })

  it('差し替えられる（テスト時のインメモリ実装のため）', () => {
    const stub = { ...original, kind: 'web' as const, getBootstrap: () => null }
    setPlatform(stub as Platform)
    expect(getPlatform().getBootstrap()).toBeNull()
  })

  it('web 実装が Platform インタフェースを満たす', () => {
    // メソッドが 1 つでも欠けると、dev:web で実行時に落ちる
    const required: (keyof Platform)[] = [
      'kind',
      'getBootstrap',
      'takeBootstrap',
      'readDocument',
      'writeDocument',
      'resolveAsset',
      'pushRecent',
      'removeRecent',
      'setZoom',
      'pickFile',
      'onDragDrop',
      'ready',
      'reportTrace',
      'warmDone',
      'openExternal',
      'openLocalFile',
      'revealInFileManager',
      'onOpenRequest',
    ]
    for (const key of required) {
      expect(original[key], `web 実装に ${key} が無い`).toBeDefined()
    }
  })
})
