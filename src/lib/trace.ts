/**
 * フロント側の起動計測（T4〜T9 / 05.performance-budget/05-operations.md §2）。
 *
 * `performance.now()` は `performance.timeOrigin` からの経過時間である。
 * Rust の T0 は UNIX epoch で渡されるため、`timeOrigin + now - t0EpochMs` で同じ基準の値に変換する。
 */
import type { TraceConfig, TraceMark } from '@/platform';

let config: TraceConfig | null = null;
const marks: TraceMark[] = [];

/** 計測の設定を反映する。bootstrap を読んだ直後に 1 回だけ呼ぶ。 */
export function initTrace(next: TraceConfig | null): void {
  config = next;
}

/** 計測が有効か。`--trace-startup` を付けた起動でだけ真になる。 */
export function isTracing(): boolean {
  return config?.enabled === true;
}

/** `performance.now()` の値を T0 起点に載せ替える。 */
function toT0(now: number): number {
  if (!config) return now;
  return performance.timeOrigin + now - config.t0EpochMs;
}

/** マーカーを記録する。無効時は何もしない。 */
export function mark(id: string, note?: string): void {
  if (!config?.enabled) return;
  // performance.mark にも記録する。DevTools のタイムラインで確認できるようにするためである。
  try {
    performance.mark(`marxdown:${id}`);
  } catch {
    // 計測の失敗でアプリ本体の動作を止めない
  }
  marks.push(note === undefined ? { id, atMs: toT0(performance.now()) } : { id, atMs: toT0(performance.now()), note });
}

/**
 * initialization_script が打った T4 を取り込む。
 *
 * T4 は初期スクリプトの評価開始時点であり、モジュールが評価されるより前の時刻である。
 * そのため Rust 側の注入スクリプトで先に記録しておく必要がある。
 */
export function adoptT4(): void {
  if (!config?.enabled) return;
  const raw = (globalThis as { __MARXDOWN_T4__?: number }).__MARXDOWN_T4__;
  if (typeof raw === 'number') marks.push({ id: 'T4', atMs: toT0(raw) });
}

/** 溜まったマーカーを取り出して空にする。Rust 側へ渡す直前に呼ぶ。 */
export function drain(): TraceMark[] {
  const out = marks.slice();
  marks.length = 0;
  return out;
}
