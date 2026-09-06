/**
 * preview feature の公開面（02.architecture/03-layers.md §2）。
 *
 * 本文の投入（`paint`）と強化（`enhance`）は「開く」経路が呼ぶので出す。
 * リンクの分岐と表示倍率は起動時に据え付けるものなので、その入口だけを出す。
 * 遅延側は `lazy/`（シンタックスハイライトと本文内検索）で、入口が 2 つあるため
 * 動的 import で実体を名指しする。
 */
export { scrollToAnchor } from './anchor';
export { enhance } from './enhance';
export { installLinkHandler, type LinkTargets } from './links';
export { openSearchLazily } from './open-search';
export { paint } from './paint';
export { applyZoom, formatZoom, zoomIn, zoomOut, zoomReset } from './zoom';
