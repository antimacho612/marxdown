/**
 * editor feature の公開面（ADR-0009）。
 *
 * 公開するのは遅延ロードの入口だけである。
 * Monaco の実体は大きく、既定の表示モードが Preview なのはこの分割境界を成立させるためでもある。
 * `index.ts` から本体を再エクスポートすると、静的な参照 1 本でその境界が失われる。
 * 本体は `lazy/editor.ts` を動的 import で参照する。
 */
export {
  closeEditorSearchLazily,
  formatTableLazily,
  gotoLineLazily,
  mountEditorLazily,
  openEditorSearchLazily,
  preloadEditor,
  relayoutEditorLazily,
  setSplitSyncLazily,
} from './open-editor';
