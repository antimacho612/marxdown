/**
 * 表示に関する UI 状態。
 *
 * ドキュメントから導かれる値（`features/document/store.svelte.ts`）と分けているのは、
 * ファイルを開き直しても保たれる状態だから。倍率は「今このファイル」の性質ではなく
 * 「この人の見え方の好み」であり、ライフサイクルが違う。
 *
 * 表示モード（M2）もここに増える。
 */
import { DEFAULT_PANES, type Panes } from '@/platform';

class ViewStore {
  /** 表示倍率（F-VIEW-11）。実際の適用は `zoom.ts` が CSS 変数で行う。 */
  zoom = $state(1);

  /**
   * ペインの開閉と幅（F-NAV-04 / 03.ux-spec/06-panes.md §3）。
   *
   * **`state.json` に載る形（`Panes`）をそのまま持つ。** 平たい 4 つの
   * フィールドに割ると、永続化のたびに組み直す関数が要る。
   *
   * 初期値は `panes.ts` が bootstrap から**同期的に**入れる。ここが既定値のまま
   * 1 フレーム描かれることは無い（`zoom` と同じ理由 / 02.architecture/04-rust-responsibilities.md §5）。
   *
   * `left`（Explorer）は M3。M1.5 では誰も書き換えないが、器が無いと
   * 「どちらの幅か」が曖昧な値を先に永続化してしまう。
   */
  panes = $state<Panes>({ left: { ...DEFAULT_PANES.left }, right: { ...DEFAULT_PANES.right } });

  /**
   * ウィンドウが最大化されているか（03.ux-spec/01-screen-layout.md §1）。
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
