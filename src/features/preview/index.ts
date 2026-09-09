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
export { openSearchLazily } from './open-search';
export { paint } from './paint';
export { applyZoom, formatZoom, zoomIn, zoomOut, zoomReset } from './zoom';
