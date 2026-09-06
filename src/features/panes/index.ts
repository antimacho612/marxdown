/**
 * panes feature の公開面（02.architecture/03-layers.md §2）。
 *
 * 遅延チャンクを持たない。ライトペインの枠は初期フレームから要るため `main` に常駐する。
 * 幅の下限・上限とその丸め（`clampPaneWidth`）は feature 内の都合で、
 * 外から幅を直接いじる経路は作らない（ドラッグとキーボードは `RightPane` が持つ）。
 */
export { default as RightPane } from './RightPane.svelte';
export { initPanes, openRightPane, toggleRightPane } from './panes';
