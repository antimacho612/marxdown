/**
 * ウィンドウ操作（03.ux-spec/01-screen-layout.md §1）。
 *
 * `decorations: false` であるため、`─ □ ✕` は自分たちの `<button>` である。
 * ここはその押下を Platform 層へ渡すだけの薄い層である。
 *
 * 最大化状態はボタン以外（`Win+↑` / ダブルクリック / 画面端ドラッグ）でも変わる。
 * そのため押した側でフラグを反転させず、OS 側の変化を Rust 経由で受け取って反映する。
 */
import { viewStore } from '@/features/view';
import { getPlatform } from '@/platform';

/** 最小化する。 */
export function minimizeWindow(): void {
  void getPlatform().minimizeWindow();
}

/** 最大化と復元を切り替える。 */
export function toggleMaximizeWindow(): void {
  void getPlatform().toggleMaximizeWindow();
}

/** 閉じる。設定 `window.closeToTray` によってはトレイへの格納になる（ADR-0007 論点 2）。 */
export function closeWindow(): void {
  void getPlatform().closeWindow();
}

/**
 * 最大化状態の追従を開始する。`ready()` の後に呼ぶ（02.architecture/05-startup-sequence.md §2）。
 *
 * IPC を伴う購読であり、本文が読める時点に間に合っている必要がない。
 * 遅れた場合の最悪の結果は、最大化して復元した直後の数十 ms だけボタンの表示が最大化前のままになることで、次の変化で解消する。
 *
 * 初回だけ現在値を取得する。
 * 最大化した状態で終了し、その状態を復元して起動した場合に、取得しないと `□` のまま開始してしまうためである。
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

/**
 * 測り直しを待つ時間。ウィンドウのリサイズ中に毎フレーム IPC を送信しないために設ける。
 *
 * 1 回だけの `setTimeout` であり、ポーリングではない（05.performance-budget/04-targets.md §5）。
 * ドラッグ中に矩形が古いままでも影響はない。その間に最大化ボタンへホバーすることはできない。
 */
const SNAP_REPORT_DEBOUNCE_MS = 120;

/**
 * 位置を報告する対象（最大化ボタン）。
 *
 * 追従の登録（`trackSnapLayoutsTarget`）と初回の報告（`reportSnapLayoutsTarget`）が別の時点で実行されるため、両者をこの変数で繋ぐ。
 * 対象のボタンは 1 つだけである。
 */
let target: HTMLElement | null = null;

/**
 * 最大化ボタンの位置を Rust へ通知し続ける（Windows の Snap Layouts）。
 * `ResizeObserver` は位置の変化を検知できないため、`resize` イベントを監視する（Windows 以外は Rust 側で無視する）。
 *
 * ここでは矩形を測定しない。
 * マウント直後の `getBoundingClientRect()` は強制的な同期レイアウト計算を発生させ（32〜35ms / measurements/03-cold-start.md §5）、その間はシェル描画とパース評価を並行させる起動シーケンスの前提（02.architecture/05-startup-sequence.md §2）が成立しなくなる。
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
 * 最初の 1 回だけ矩形を報告する。`ready()` の後に呼ぶ（02.architecture/05-startup-sequence.md §2）。
 *
 * 最大化ボタンの位置を Windows へ応答する主体（`snap_layouts::install`）は `ready` コマンドの中で登録される（`src-tauri/src/commands.rs`）。
 * そのため、ここまで遅らせても報告は失われない。
 *
 * 遅れた場合の最悪の結果は、起動直後の数十 ms だけ最大化ボタンにホバーしてもフライアウトが表示されないことで、ホバーし直せば表示される。
 */
export function reportSnapLayoutsTarget(): void {
  if (!target) return;
  report(target);
}

/**
 * 矩形を測って Rust へ渡す。
 *
 * `getBoundingClientRect()` は強制同期レイアウトを発生させるため、呼び出す時点を選ぶこと（`trackSnapLayoutsTarget` の「ここでは矩形を測定しない」）。
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
