/**
 * 表示に関する UI 状態。
 *
 * ドキュメントから導かれる値（`features/document/store.svelte.ts`）と分けているのは、
 * ファイルを開き直しても保たれる状態だから。倍率は「今このファイル」の性質ではなく
 * 「この人の見え方の好み」であり、ライフサイクルが違う。
 *
 * M2 以降で表示モード・サイドバーの開閉がここに増える。
 */
class ViewStore {
  /** 表示倍率（F-VIEW-11）。実際の適用は `zoom.ts` が CSS 変数で行う。 */
  zoom = $state(1);
}

export const viewStore = new ViewStore();
