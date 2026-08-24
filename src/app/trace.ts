/**
 * フロント側の起動計測（05.performance-budget.md §5.2）。
 *
 * ```text
 * T4  初期スクリプト評価開始   (bootstrap.rs が initialization_script で打つ)
 * T5  bootstrap 読み取り完了
 * T6  Worker への parse 送信
 * T7  Worker から HTML 受信
 * T8  本文の DOM 挿入完了 + 次の rAF   ← これが「読める」瞬間
 * T9  window.show() 呼び出し           (Rust 側の ready コマンドで打つ)
 * ```
 *
 * # T0 起点への載せ替え
 *
 * `performance.now()` は `performance.timeOrigin` からの経過。
 * Rust の T0 は UNIX epoch で渡されているので、
 * `timeOrigin + now - t0EpochMs` で「T0 からの経過ミリ秒」になる。
 */
import type { TraceConfig, TraceMark } from '@/platform';

let config: TraceConfig | null = null;
const marks: TraceMark[] = [];

export function initTrace(next: TraceConfig | null): void {
  config = next;
}

export function isTracing(): boolean {
  return config?.enabled === true;
}

/** `performance.now()` の値を T0 起点に載せ替える。 */
function toT0(now: number): number {
  if (!config) return now;
  return performance.timeOrigin + now - config.t0EpochMs;
}

export function mark(id: string, note?: string): void {
  if (!config?.enabled) return;
  // performance.mark も打っておく。DevTools のタイムラインで見えるようにするため。
  try {
    performance.mark(`marxdown:${id}`);
  } catch {
    // 計測が本体を壊してはいけない
  }
  marks.push(note === undefined ? { id, atMs: toT0(performance.now()) } : { id, atMs: toT0(performance.now()), note });
}

/**
 * initialization_script が打った T4 を取り込む。
 *
 * T4 は「初期スクリプト評価開始」であり、モジュールが評価されるより前の時刻。
 * だからこそ Rust 側の注入スクリプトで先に記録しておく必要がある。
 */
export function adoptT4(): void {
  if (!config?.enabled) return;
  const raw = (globalThis as { __MARXDOWN_T4__?: number }).__MARXDOWN_T4__;
  if (typeof raw === 'number') marks.push({ id: 'T4', atMs: toT0(raw) });
}

export function drain(): TraceMark[] {
  const out = marks.slice();
  marks.length = 0;
  return out;
}
