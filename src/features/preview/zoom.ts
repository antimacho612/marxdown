/**
 * 表示倍率（F-VIEW-11 / 03.ux-spec.md §5.3）。
 *
 * # 本文だけを拡縮する
 *
 * 掛かるのは `--mx-zoom` を読む `.mx-preview` だけで、タイトルバーと
 * ステータスバーは動かない。「本文が、ここに、広く表示される」（§2.1）という
 * 画面の主従を、倍率を変えても保つため。
 *
 * WebView 自身のズーム（`Ctrl+=` の既定動作）を使わないのも同じ理由で、
 * あちらはクロームごと拡大してしまう。`shortcuts.ts` が `preventDefault()` で
 * 既定動作を止めているので、二重には掛からない。
 *
 * # React を通さない
 *
 * 適用は CSS カスタムプロパティの書き換え 1 回で終わる。React の再レンダリングは
 * 挟まない（ADR-0005）。ストアに書くのは、ステータスバーに数字を出すためだけ。
 */
import { useViewStore } from '@/features/view/store'
import { getPlatform } from '@/platform'

/** `src-tauri/src/store.rs` の `ZOOM_MIN` / `ZOOM_MAX` と揃える。 */
export const ZOOM_MIN = 0.5
export const ZOOM_MAX = 3
export const ZOOM_DEFAULT = 1

/**
 * 倍率の刻み。等比ではなく、よく使う値（100% / 125% / 150%）にきっちり止まるよう並べる。
 * 「押した回数」ではなく「見えている数字」で操作する道具にしたい。
 */
const STEPS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3] as const

/** 永続化を待つ時間。`Ctrl+=` の連打で毎回ファイルを書かないため。 */
const PERSIST_DEBOUNCE_MS = 400

let persistTimer: ReturnType<typeof setTimeout> | null = null

/**
 * 倍率を適用する。
 *
 * `persist` を false にすると保存しない。起動時の復元がこれにあたる
 * （読み出した値を、そのまま書き戻す必要はない）。
 */
export function applyZoom(zoom: number, persist = true): number {
  const next = clamp(zoom)
  document.documentElement.style.setProperty('--mx-zoom', String(next))
  useViewStore.getState().setZoom(next)
  if (persist) schedulePersist(next)
  return next
}

export function zoomIn(): number {
  return applyZoom(nextStep(useViewStore.getState().zoom, 1))
}

export function zoomOut(): number {
  return applyZoom(nextStep(useViewStore.getState().zoom, -1))
}

export function zoomReset(): number {
  return applyZoom(ZOOM_DEFAULT)
}

/** 表示用。`1.25` → `125%`。 */
export function formatZoom(zoom: number): string {
  return `${Math.round(zoom * 100)}%`
}

/**
 * 現在値から刻み 1 つぶん動かす。
 *
 * 現在値が刻みの上に無い場合（設定ファイルを手で書いた場合など）でも、
 * 「上へ」なら必ず大きい側の最も近い刻みに乗る。
 */
function nextStep(current: number, direction: 1 | -1): number {
  if (direction === 1) {
    return STEPS.find((s) => s > current + 1e-6) ?? ZOOM_MAX
  }
  return STEPS.findLast((s) => s < current - 1e-6) ?? ZOOM_MIN
}

function clamp(zoom: number): number {
  if (!Number.isFinite(zoom)) return ZOOM_DEFAULT
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom))
}

/**
 * 保存を遅らせる。**1 回きりの `setTimeout` であって、ポーリングではない**
 * （05.performance-budget.md §4.5）。
 */
function schedulePersist(zoom: number): void {
  if (persistTimer !== null) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    persistTimer = null
    void getPlatform().setZoom(zoom)
  }, PERSIST_DEBOUNCE_MS)
}
