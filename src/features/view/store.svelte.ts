/**
 * 表示に関する UI 状態。
 *
 * ドキュメントから導かれる値（`features/document/store.svelte.ts`）と分けているのは、
 * ファイルを開き直しても保たれる状態だから。倍率は「今このファイル」の性質ではなく
 * 「この人の見え方の好み」であり、ライフサイクルが違う。
 *
 * 表示モード（M2）・サイドバーの開閉（M3）もここに増える。
 */
class ViewStore {
  /** 表示倍率（F-VIEW-11）。実際の適用は `zoom.ts` が CSS 変数で行う。 */
  zoom = $state(1);

  /**
   * ウィンドウが最大化されているか（03.ux-spec.md §2.1）。
   *
   * 自前のタイトルバーになったので、`□` と `❐` の描き分けは自分たちの仕事になった。
   * **これは OS の状態の写しであって、真実ではない。** 更新するのは
   * `app/window.ts` の購読だけで、ボタン側から反転させない。
   */
  maximized = $state(false);

  /**
   * 最大化ボタンにマウスが乗っているか（Windows の Snap Layouts）。
   *
   * **CSS の `:hover` の代わり。** フライアウトを出すために、その矩形は
   * 非クライアント領域だと Windows へ答えており（`snap_layouts.rs`）、
   * そこには WebView のマウスイベントが届かない。Windows 以外では常に false で、
   * そちらでは素の `:hover` が効いている。
   */
  maximizeHovered = $state(false);
}

export const viewStore = new ViewStore();
