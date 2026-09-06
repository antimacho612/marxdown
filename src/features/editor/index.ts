/**
 * editor feature の公開面（02.architecture/03-layers.md §2 / ADR-0009）。
 *
 * **出すのは遅延ロードの入口だけ。** Monaco の実体は 792KB あり、既定の表示モードが
 * Preview なのはこの分割境界を成立させるためでもある（02.architecture/05-startup-sequence.md §1）。
 * `index.ts` から本体を再輸出すると、その境界が静的な参照 1 本で崩れる。
 * 本体は `lazy/editor.ts` を動的 import で名指しする。
 */
export {
  closeEditorSearchLazily,
  mountEditorLazily,
  openEditorSearchLazily,
  preloadEditor,
  relayoutEditorLazily,
  setSplitSyncLazily,
} from './open-editor';
