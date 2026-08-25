/**
 * ウィンドウ操作（03.ux-spec.md §2.1 / OQ-02 = B）。
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
 * 最大化状態の追従を始める。**`ready()` の後に呼ぶ**（02.architecture.md §5.1）。
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
/* Snap Layouts（Windows / 06.roadmap.md §5.2）                          */
/* ------------------------------------------------------------------ */

/**
 * 測り直しを待つ時間。ウィンドウのリサイズ中に毎フレーム IPC を投げないため。
 *
 * **1 回きりの `setTimeout` であって、ポーリングではない**
 * （05.performance-budget.md §4.5）。ドラッグ中に矩形が古いことは害にならない。
 * その間にユーザーが最大化ボタンへホバーすることはできない。
 */
const SNAP_REPORT_DEBOUNCE_MS = 120;

/**
 * 最大化ボタンの居場所を Rust へ知らせ続ける（Windows の Snap Layouts）。
 *
 * ボタンは右端に張り付いているので、**位置が変わるのはウィンドウ幅が変わったときだけ**。
 * `ResizeObserver` では位置の変化を拾えないので、`resize` を見る。
 *
 * Windows 以外では Rust 側が受け取って捨てる。分岐をここに持ち込まないのは、
 * Domain 層がプラットフォームを知らない状態を保つため（02.architecture.md §3.1）。
 */
export function trackSnapLayoutsTarget(element: HTMLElement): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const report = (): void => {
    const box = element.getBoundingClientRect();
    void getPlatform().setSnapLayoutsTarget({
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
    });
  };

  const schedule = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      report();
    }, SNAP_REPORT_DEBOUNCE_MS);
  };

  report();
  globalThis.addEventListener('resize', schedule);

  return () => {
    if (timer !== null) clearTimeout(timer);
    globalThis.removeEventListener('resize', schedule);
  };
}
