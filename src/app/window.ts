/**
 * ウィンドウ操作（03.ux-spec/01-screen-layout.md §1）。
 *
 * `decorations: false` にしたので、`─ □ ✕` は自分たちの `<button>` である。
 * ここはその押し下げを Platform 層へ渡すだけの薄い層で、
 * コンポーネント（`WindowControls.svelte`）から Tauri が見えないようにするためにある。
 *
 * # 状態を押した側で持たない
 *
 * 最大化は、ボタン以外にも `Win+↑` / タイトルバーのダブルクリック /
 * 画面上端へのドラッグで切り替わる。押した側でフラグを反転させると、
 * OS 由来の変化を取りこぼして絵柄（□ / ❐）がずれる。
 * **真実は OS にあり**、Rust 側が変化したときだけ流してくるものを写す。
 */
import { viewStore } from '@/features/view/store.svelte';
import { getPlatform } from '@/platform';

export function minimizeWindow(): void {
  void getPlatform().minimizeWindow();
}

export function toggleMaximizeWindow(): void {
  void getPlatform().toggleMaximizeWindow();
}

export function closeWindow(): void {
  void getPlatform().closeWindow();
}

/**
 * 最大化状態の追従を始める。**`ready()` の後に呼ぶ**（02.architecture/05-startup-sequence.md §1）。
 *
 * IPC を伴う購読であり、本文が読める瞬間に間に合っている必要がない。
 * 遅れたときの最悪は「最大化して復元した直後の数十 ms だけ、ボタンの絵柄が
 * 最大化前のまま」で、次の変化で必ず正しくなる。
 *
 * 初回の 1 回だけ現在値を聞く。最大化した状態で終了 → 復元した起動のときに、
 * 聞かないと `□` のまま始まってしまうため。
 */
export function installWindowState(): void {
  const platform = getPlatform();
  platform.onWindowMaximizedChanged((maximized) => {
    viewStore.maximized = maximized;
  });
  platform.onMaximizeHoverChanged((hovered) => {
    viewStore.maximizeHovered = hovered;
  });
  void platform.isWindowMaximized().then((maximized) => {
    viewStore.maximized = maximized;
    return maximized;
  });
}

/* ------------------------------------------------------------------ */
/* Snap Layouts（Windows / 06.roadmap/m1.5-shell-and-settings.md §2）                          */
/* ------------------------------------------------------------------ */

/**
 * 測り直しを待つ時間。ウィンドウのリサイズ中に毎フレーム IPC を投げないため。
 *
 * **1 回きりの `setTimeout` であって、ポーリングではない**
 * （05.performance-budget/04-targets.md §5）。ドラッグ中に矩形が古いことは害にならない。
 * その間にユーザーが最大化ボタンへホバーすることはできない。
 */
const SNAP_REPORT_DEBOUNCE_MS = 120;

/**
 * 居場所を答える相手（最大化ボタン）。
 *
 * 追従の登録（`trackSnapLayoutsTarget`）と初回の報告（`reportSnapLayoutsTarget`）が
 * **別の時点で走る**ので、あいだをこれで繋ぐ。ボタンは 1 つしか無い。
 */
let target: HTMLElement | null = null;

/**
 * 最大化ボタンの居場所を Rust へ知らせ続ける（Windows の Snap Layouts）。
 *
 * ボタンは右端に張り付いているので、**位置が変わるのはウィンドウ幅が変わったときだけ**。
 * `ResizeObserver` では位置の変化を拾えないので、`resize` を見る。
 *
 * Windows 以外では Rust 側が受け取って捨てる。分岐をここに持ち込まないのは、
 * Domain 層がプラットフォームを知らない状態を保つため（02.architecture/03-layers.md §1）。
 *
 * # ここで矩形を測らない（OQ-30）
 *
 * この関数はボタンがマウントされた直後（`WindowControls.svelte` の `$effect`）に
 * 呼ばれる。**その場で `getBoundingClientRect()` を呼んではいけない。**
 *
 * シェルを描いた直後はスタイルが未計算で、矩形を要求すると全体のスタイル再計算と
 * レイアウトが同期的に走る。**実測 32〜35ms。** しかも本文（`#mx-preview`）はまだ
 * 空なので、そこで作ったレイアウトは本文を入れた時点で捨てられる。
 *
 * 悪いのは捨てられることだけではない。この 32〜35ms のあいだ **Worker のスクリプト
 * 評価も進まない。** 「パースの送信をシェルの描画より前に置き、両者を重ねる」という
 * 起動シーケンスの前提（02.architecture/05-startup-sequence.md §1）が、ここで壊れる。
 *
 * だから**ここでは相手を控えて `resize` を見張るだけ**にして、初回の報告は
 * `reportSnapLayoutsTarget()` が `ready()` の後に行う。
 */
export function trackSnapLayoutsTarget(element: HTMLElement): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const schedule = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      report(element);
    }, SNAP_REPORT_DEBOUNCE_MS);
  };

  target = element;
  globalThis.addEventListener('resize', schedule);

  return () => {
    if (target === element) target = null;
    if (timer !== null) clearTimeout(timer);
    globalThis.removeEventListener('resize', schedule);
  };
}

/**
 * 最初の 1 回だけ矩形を報告する。**`ready()` の後に呼ぶ**
 * （02.architecture/05-startup-sequence.md §1 / OQ-30）。
 *
 * Windows へ「ここが最大化ボタンだ」と答える主体（`snap_layouts::install`）は
 * `ready` コマンドの中で付く（`src-tauri/src/commands.rs`）。**ここへ回しても
 * 取りこぼさない。**
 *
 * 遅れたときの最悪は「起動直後の数十 ms だけ、最大化ボタンにホバーしても
 * フライアウトが出ない」ことで、ホバーし直せば必ず出る。
 */
export function reportSnapLayoutsTarget(): void {
  if (!target) return;
  report(target);
}

/**
 * 矩形を測って Rust へ渡す。
 *
 * **`getBoundingClientRect()` は強制同期レイアウトである。**
 * 呼ぶ時点を選ぶこと（`trackSnapLayoutsTarget` の「ここで矩形を測らない」）。
 */
function report(element: HTMLElement): void {
  const box = element.getBoundingClientRect();
  void getPlatform().setSnapLayoutsTarget({
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
  });
}
