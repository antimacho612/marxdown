/**
 * view feature の公開面（02.architecture/03-layers.md §2）。
 *
 * ここが持つのは**ビューの状態**だけである。モードの切り替えそのもの（エディターを載せる・
 * ライブ描画を止める・検索を開く）は組み立ての仕事なので `features/mode/` にある。
 * 同居させると、`viewStore` を読むだけの側までその依存を引き込む（feature 単位で循環する）。
 *
 * 遅延チャンクを持たない。分割比もスクロール同期も初期フレームから要る。
 * 分割比の丸めと保存（`split.ts` の `setSplit` 以下）は `SplitDivider` の内側の都合なので出さない。
 */
export { default as SplitDivider } from './SplitDivider.svelte';
export { attachEditorScrollPort, jumpToEditorLine, startScrollSync, stopScrollSync } from './scroll-sync';
export type { EditorScrollPort } from './scroll-sync';
export { initSplit } from './split';
export { viewStore } from './store.svelte';
