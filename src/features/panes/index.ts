/**
 * panes feature の公開面（02.architecture/03-layers.md §2）。
 *
 * 遅延チャンクは持たない。ライトペインの枠は初期フレームから必要になるため `main` に含める。
 * 幅の下限・上限とその丸め（`clampPaneWidth`）は feature 内部の関心事であり、外から幅を直接変更する経路は作らない（ドラッグとキーボード操作は `RightPane` が持つ）。
 */
export { default as LeftPane } from './LeftPane.svelte';
export { default as RightPane } from './RightPane.svelte';
export { initPanes, openLeftPane, openRightPane, toggleLeftPane, toggleRightPane } from './panes';
