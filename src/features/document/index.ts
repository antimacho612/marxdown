/**
 * document feature の公開面（02.architecture/03-layers.md §2）。
 *
 * 最も多くの feature から参照されるため、公開する範囲を明示しておく。
 * 遅延チャンクは持たない。本文の読み書きは起動時の最初のフレームから必要になる。
 *
 * 出さないもの: ダーティの内部判定（`refreshDirty` / `markDirty`）、本文の同期（`syncDocumentText` /
 * `detachEditor`）、破棄の確認（`confirmDiscard` / `registerSaver`）、`isEolChanged`、
 * ライブ描画の後始末（`resetLiveRender`）。いずれも feature の中で完結する。
 */
export { markClean, setDirty } from './dirty';
export { ENCODINGS, reinterpret } from './encoding';
export { effectiveEol, nextEol, toggleEol } from './eol';
export {
  cancelLiveRender,
  liveRenderDebug,
  observeLiveRender,
  refreshOutlineOnOpen,
  renderNow,
  scheduleLiveRender,
  type LiveRenderTiming,
} from './live';
export { configureNewDocument, newDocument } from './new';
export {
  configureOpener,
  describeOpenError,
  getParser,
  openDocument,
  openDropped,
  openPath,
  openViaDialog,
  previewScrollTop,
  reloadCurrent,
} from './open';
export { saveAsSafely, saveSafely, saveThenQuit } from './save';
export { documentStore, type Notice, type NoticeAction } from './store.svelte';
export { attachEditor, getDocumentText, resetDocumentText, setDocumentText } from './text';
export { installFileWatch } from './watch';
