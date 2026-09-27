/**
 * 表示に関する UI 状態。
 *
 * ドキュメントから導かれる値（`features/document/store.svelte.ts`）と分けているのは、ファイルを開き直しても保持される状態だからである。
 * 倍率は開いているファイルの性質ではなく利用者ごとの表示設定であり、ライフサイクルが異なる。
 */
import { DEFAULT_PANES, SPLIT_DEFAULT, type Panes, type ViewMode } from '@/platform';

class ViewStore {
  /**
   * 表示モード（F-MODE-01, 02, 03）。切り替えは `features/mode/mode.ts`。
   *
   * ここでは値だけを持つ。
   * 面の出し分けは `<html data-mx-mode>` を参照する CSS が行い、エディターの実体は遅延チャンクにある。
   * UI（ステータスバー）はこの値だけを購読する。
   *
   * 初期値は `initMode` が bootstrap からシェルの描画前に設定する（倍率・ペインと同じ）。
   */
  mode = $state<ViewMode>('preview');

  /** 表示倍率（F-VIEW-11）。実際の適用は `zoom.ts` が CSS 変数で行う。 */
  zoom = $state(1);

  /**
   * Split の分割比（エディター側の取り分）。
   *
   * 列幅そのものは CSS 変数が持つ（`split.ts`）。
   * ここに置いてあるのは分割線の `aria-valuenow` と永続化のためで、UI はこの値を参照して描画しない。
   * ドラッグ中に Svelte の更新がレイアウトのたびに挟まらないようにするための分担である。
   */
  split = $state(SPLIT_DEFAULT);

  /**
   * Split のスクロール同期。既定は有効。
   *
   * ステータスバーの `⇄` が切り替える。永続化はしない。
   * 一時的に無効化するための設定であり、次回の起動時も無効のままだと同期しない理由が分からなくなる。
   */
  scrollSync = $state(true);

  /**
   * ペインの開閉と幅（F-NAV-04）。
   *
   * `state.json` に載る形（`Panes`）をそのまま持つ。
   * 4 つのフィールドに分けると、永続化のたびに組み立て直す処理が必要になる。
   *
   * 初期値は `panes.ts` が bootstrap から同期的に設定する。
   * 既定値のまま 1 フレーム描画されることはない（`zoom` と同じ理由）。
   */
  panes = $state<Panes>({ left: { ...DEFAULT_PANES.left }, right: { ...DEFAULT_PANES.right } });

  /**
   * ウィンドウが最大化されているか。
   *
   * タイトルバーを自前で描いているため、`□` と `❐` の描き分けはフロント側が担当する。
   * この値は OS の状態の複製であり、唯一の情報源ではない。
   * 更新するのは `app/window.ts` の購読だけで、ボタン側から反転させない。
   */
  maximized = $state(false);

  /**
   * 最大化ボタンにマウスが乗っているか（Windows の Snap Layouts）。
   *
   * CSS の `:hover` の代わりに使う。
   * フライアウトを表示するため、その矩形を非クライアント領域として Windows へ応答しており（`snap_layouts.rs`）、そこには WebView のマウスイベントが届かない。
   * Windows 以外では常に false で、そちらでは `:hover` が動作する。
   */
  maximizeHovered = $state(false);
}

/** 表示に関する UI 状態。モジュールの singleton として共有する。 */
export const viewStore = new ViewStore();
