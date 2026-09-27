/**
 * preview feature の公開面（02.architecture/03-layers.md §2）。
 *
 * 本文の投入（`paint`）と後処理（`enhance`）は開く経路が呼ぶため公開する。
 * リンクの分岐と表示倍率は起動時に登録するものであり、その入口だけを公開する。
 * 遅延側は `lazy/` にあり（シンタックスハイライトと本文内検索）、呼び出し元が 2 つあるため動的 import で実体を参照する。
 */
export { scrollToAnchor } from './anchor';
export { enhance, releasePreviewResources } from './enhance';
export { installLinkHandler, type LinkTargets } from './links';
export { installTaskHandler, type TaskTargets } from './task';
export { paintMarp } from './marp';
export { openSearchLazily } from './open-search';
export { paint, patch, type PaintResult } from './paint';
export { applyZoom, formatZoom, ZOOM_MAX, ZOOM_MIN, ZOOM_STEPS, zoomIn, zoomOut, zoomReset } from './zoom';
export { installWheelZoom } from './wheel-zoom';
