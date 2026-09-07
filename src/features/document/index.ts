/**
 * document feature の公開面（02.architecture/03-layers.md §2）。
 *
 * 最も多くの feature から参照されるため、公開する範囲を明示しておく。
 * 遅延チャンクは持たない。本文の読み書きは起動時の最初のフレームから必要になる。
 *
 * 出さないもの: ダーティの書き換え（`refreshDirty` / `markDirty`）、本文の同期（`syncDocumentText` /
 * `detachEditor`）、保存の登録口（`registerSaver`）、`isEolChanged`、
 * ライブ描画の後始末（`resetLiveRender`）。いずれも feature の中で完結する。
 *
 * `isTextDirty` と `confirmDiscard` は出す。どちらもタブが要る（退避と復元でダーティの源を分ける / タブを閉じるときに尋ねる）。
 */
export { closeDocument } from './close';
export { confirmDiscard } from './discard';
export { isTextDirty, markClean, setDirty } from './dirty';
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
  openPath,
  openViaDialog,
  previewScrollTop,
  reloadCurrent,
  type OpenerConfig,
} from './open';
export { saveAsSafely, saveSafely, saveThenQuit } from './save';
export {
  documentStore,
  toMeta,
  type Notice,
  type NoticeAction,
  type StoredMeta,
  type StoredPayload,
} from './store.svelte';
export { attachEditor, getDocumentText, resetDocumentText, setDocumentText } from './text';
export { installFileWatch } from './watch';
