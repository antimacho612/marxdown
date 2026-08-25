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
  void platform.isWindowMaximized().then((maximized) => {
    viewStore.maximized = maximized;
    return maximized;
  });
}
