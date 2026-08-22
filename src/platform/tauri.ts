/**
 * Tauri 実装。**`invoke()` を呼んでよいのはこのファイルだけ**。
 *
 * 02.architecture.md §3.1: 「どこからでも `invoke()` が呼ばれる」状態を防ぐ。
 * IPC 呼び出し回数は性能に直結する。
 */
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

import type {
  Bootstrap,
  DocumentPayload,
  OpenRequest,
  Platform,
  SaveResult,
  TraceMark,
  WriteRequest,
} from './types'

const EVENT_OPEN_REQUEST = 'marxdown://open-request'

declare global {
  // eslint-disable-next-line no-var
  var __MARXDOWN_BOOTSTRAP__: Bootstrap | undefined
  // eslint-disable-next-line no-var
  var __MARXDOWN_T4__: number | undefined
}

export const tauriPlatform: Platform = {
  kind: 'tauri',

  getBootstrap() {
    return globalThis.__MARXDOWN_BOOTSTRAP__ ?? null
  },

  takeBootstrap() {
    return invoke<Bootstrap | null>('take_bootstrap')
  },

  readDocument(path) {
    return invoke<DocumentPayload>('read_document', { path })
  },

  writeDocument(req: WriteRequest) {
    return invoke<SaveResult>('write_document', { req })
  },

  resolveAsset(href, baseDir) {
    return invoke<string>('resolve_asset', { href, baseDir })
  },

  ready() {
    return invoke<void>('ready')
  },

  reportTrace(marks: TraceMark[]) {
    return invoke<void>('report_trace', { marks })
  },

  warmDone(requestId, path, detail) {
    return invoke<number | null>('warm_done', { requestId, path, detail })
  },

  openExternal(url) {
    return invoke<void>('open_external', { url })
  },

  revealInFileManager(path) {
    return invoke<void>('reveal_in_file_manager', { path })
  },

  onOpenRequest(handler) {
    // listen は Promise を返すため、解除は「解除されるまで待ってから呼ぶ」形にする
    let dispose: (() => void) | null = null
    let disposed = false
    void listen<OpenRequest>(EVENT_OPEN_REQUEST, (event) => handler(event.payload)).then((un) => {
      if (disposed) un()
      else dispose = un
      return un
    })
    return () => {
      disposed = true
      dispose?.()
    }
  },
}
