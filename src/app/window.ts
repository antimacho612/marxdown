/**
 * ウィンドウ操作（03.ux-spec/01-screen-layout.md §1）。
 *
 * `decorations: false` にしたので `─ □ ✕` は自分たちの `<button>` である。
 * ここはその押下を Platform 層へ渡すだけの薄い層である。
 *
 * 最大化状態はボタン以外（`Win+↑` / ダブルクリック / 画面端ドラッグ）でも変わる。
 * そのため押した側でフラグを反転させず、OS 側の変化を Rust 経由で受け取って反映する。
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
 * 最大化ボタンの位置を Rust へ通知し続ける（Windows の Snap Layouts）。
 * `ResizeObserver` は位置の変化を検知できないため、`resize` イベントを監視する（Windows 以外は Rust 側で無視する）。
 *
 * ここでは矩形を測定しない（OQ-30）。
 * マウント直後の `getBoundingClientRect()` は強制的な同期レイアウト計算を発生させ（実測 32〜35ms）、その間はシェル描画とパース評価を並行させる起動シーケンスの前提（02.architecture/05-startup-sequence.md §1）が成立しなくなる。
 * ここでは対象の要素を保持して `resize` を監視するだけにとどめ、初回の通知は `reportSnapLayoutsTarget()` が `ready()` の後に行う。
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
