/**
 * editor feature の公開面（02.architecture/03-layers.md §2 / ADR-0009）。
 *
 * 公開するのは遅延ロードの入口だけである。
 * Monaco の実体は 792KB あり、既定の表示モードが Preview なのはこの分割境界を成立させるためでもある（02.architecture/05-startup-sequence.md §1）。
 * `index.ts` から本体を再エクスポートすると、静的な参照 1 本でその境界が失われる。
 * 本体は `lazy/editor.ts` を動的 import で参照する。
 */
export {
  closeEditorSearchLazily,
  mountEditorLazily,
  openEditorSearchLazily,
  preloadEditor,
  relayoutEditorLazily,
  setSplitSyncLazily,
} from './open-editor';
