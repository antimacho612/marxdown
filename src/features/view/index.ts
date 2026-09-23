/**
 * view feature の公開面（02.architecture/03-layers.md §2）。
 *
 * ここが持つのはビューの状態だけである。
 * モードの切り替えそのもの（エディターのマウント、ライブ描画の停止、検索を開く処理）は組み立ての担当であり `features/mode/` にある。
 * 同居させると、`viewStore` を読むだけの側までその依存を引き込むことになり、feature 単位で循環する。
 *
 * 遅延チャンクは持たない。分割比もスクロール同期も初期フレームから必要になる。
 * 分割比の丸めと保存（`split.ts` の `setSplit` 以降）は `SplitDivider` の内部の関心事であるため公開しない。
 */
export { default as SplitDivider } from './SplitDivider.svelte';
export {
  attachEditorScrollPort,
  jumpToEditorLine,
  startScrollSync,
  stopScrollSync,
  takeEditorLead,
} from './scroll-sync';
export type { EditorScrollPort } from './scroll-sync';
export { initSplit } from './split';
export { initWindowRole, isSatellite, windowRole } from './role';
export { viewStore } from './store.svelte';
