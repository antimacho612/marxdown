/**
 * 表示倍率（F-VIEW-11 / 03.ux-spec/04-keybindings.md §3）。
 *
 * 拡縮するのは `--mx-zoom` を読む `.mx-preview` だけで、タイトルバーやステータスバーは動かない（本文が主役という画面の主従を保つため）。
 * WebView 自身のズームはクロームごと拡大するため使わず、`shortcuts.ts` が `preventDefault()` で既定動作を止めて二重に掛からないようにする。
 * 適用は CSS カスタムプロパティの書き換え 1 回で終わり、ストアに書くのはステータスバー表示のためだけである。
 */
import { viewStore } from '@/features/view';
import { getPlatform } from '@/platform';

/** 倍率の範囲と既定値。`src-tauri/src/store.rs` の `ZOOM_MIN` / `ZOOM_MAX` と一致させる。 */
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 3;
export const ZOOM_DEFAULT = 1;

/**
 * 倍率の刻み。
 * 等比ではなく、使用頻度の高い値（100% / 125% / 150%）に一致するよう並べる。
 * 操作の基準を操作回数ではなく表示される倍率に置くためである。
 */
const STEPS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3] as const;

/** 永続化を待つ時間。`Ctrl+=` の連打で毎回ファイルを書かないため。 */
const PERSIST_DEBOUNCE_MS = 400;

let persistTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * 倍率を適用する。
 *
 * `persist` を false にすると保存しない。起動時の復元がこれにあたる
 * （読み出した値を、そのまま書き戻す必要はない）。
 */
export function applyZoom(zoom: number, persist = true): number {
  const next = clamp(zoom);
  document.documentElement.style.setProperty('--mx-zoom', String(next));
  viewStore.zoom = next;
  if (persist) schedulePersist(next);
  return next;
}

/** 1 段階拡大する。 */
export function zoomIn(): number {
  return applyZoom(nextStep(viewStore.zoom, 1));
}

/** 1 段階縮小する。 */
export function zoomOut(): number {
  return applyZoom(nextStep(viewStore.zoom, -1));
}

/** 等倍に戻す。 */
export function zoomReset(): number {
  return applyZoom(ZOOM_DEFAULT);
}

/** 表示用。`1.25` → `125%`。 */
export function formatZoom(zoom: number): string {
  return `${Math.round(zoom * 100)}%`;
}

/**
 * 現在値から刻み 1 つぶん動かす。
 *
 * 現在値が刻みと一致しない場合（設定ファイルを手で編集した場合など）でも、拡大方向なら必ず現在値より大きい最も近い刻みになる。
 */
function nextStep(current: number, direction: 1 | -1): number {
  if (direction === 1) {
    return STEPS.find((s) => s > current + 1e-6) ?? ZOOM_MAX;
  }
  return STEPS.findLast((s) => s < current - 1e-6) ?? ZOOM_MIN;
}

function clamp(zoom: number): number {
  if (!Number.isFinite(zoom)) return ZOOM_DEFAULT;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
}

/**
 * 保存を遅らせる。
 * 1 回だけの `setTimeout` であり、ポーリングではない（05.performance-budget/04-targets.md §5）。
 */
function schedulePersist(zoom: number): void {
  if (persistTimer !== null) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void getPlatform().setZoom(zoom);
  }, PERSIST_DEBOUNCE_MS);
}
