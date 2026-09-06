/**
 * 表示に関する UI 状態。
 *
 * ドキュメントから導かれる値（`features/document/store.svelte.ts`）と分けているのは、
 * ファイルを開き直しても保たれる状態だから。倍率は「今このファイル」の性質ではなく
 * 「この人の見え方の好み」であり、ライフサイクルが違う。
 *
 */
import { DEFAULT_PANES, SPLIT_DEFAULT, type Panes, type ViewMode } from '@/platform';

class ViewStore {
  /**
   * 表示モード（F-MODE-01, 02, 03）。切り替えは `features/mode/mode.ts`。
   *
   * **ここは値だけを持つ。** 面の出し分けは `<html data-mx-mode>` を見る CSS が行い、
   * エディターの実体は遅延チャンクにいる。UI（ステータスバー）はこの値だけを購読する。
   *
   * 初期値は `initMode` が bootstrap から**シェルを描く前**に入れる（倍率・ペインと同じ）。
   * `'split'` は Phase 5。器としての型には最初から入っている。
   */
  mode = $state<ViewMode>('preview');

  /** 表示倍率（F-VIEW-11）。実際の適用は `zoom.ts` が CSS 変数で行う。 */
  zoom = $state(1);

  /**
   * Split の分割比（エディター側の取り分 / 03.ux-spec/03-split-mode.md §1）。
   *
   * **列幅そのものは CSS 変数が持つ**（`split.ts`）。ここに置いてあるのは
   * 分割線の `aria-valuenow` と永続化のためで、UI はこの値では描かれない。
   * ドラッグ中に Svelte の更新をレイアウトのたびに挟まないための分担である。
   */
  split = $state(SPLIT_DEFAULT);

  /**
   * Split のスクロール同期（03.ux-spec/03-split-mode.md §2）。**既定 ON。**
   *
   * ステータスバーの `⇄` が切り替える。**永続化しない。**
   * 「いまこの作業のあいだ切っておく」ための一時的なもので、
   * 次に開いたときも切れていると「なぜ追随しないのか」が分からなくなる。
   */
  scrollSync = $state(true);

  /**
   * ペインの開閉と幅（F-NAV-04 / 03.ux-spec/06-panes.md §3）。
   *
   * **`state.json` に載る形（`Panes`）をそのまま持つ。** 平たい 4 つの
   * フィールドに割ると、永続化のたびに組み直す関数が要る。
   *
   * 初期値は `panes.ts` が bootstrap から**同期的に**入れる。ここが既定値のまま
   * 1 フレーム描かれることは無い（`zoom` と同じ理由 / 02.architecture/04-rust-responsibilities.md §5）。
   *
   * `left`（Explorer）は M3。それまでは誰も書き換えないが、器が無いと
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
