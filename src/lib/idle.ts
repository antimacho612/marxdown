/**
 * アイドル時間に仕事を分割して実行する道具。
 * 仕事があるときだけ次を予約する仕組みで、何もなければコールバックは残らない（05.performance-budget/04-targets.md §5「アイドル時 CPU ≒ 0」）。
 * `setInterval` は使わないこと。
 */

/** `requestIdleCallback` の締切。フォールバック経路でも同じ形で渡す。 */
export interface IdleDeadline {
  timeRemaining(): number;
  didTimeout: boolean;
}

type IdleCallback = (deadline: IdleDeadline) => void;

/**
 * Safari と古い WebView には `requestIdleCallback` が無い。
 * `setTimeout(0)` は 1 回きりなのでフォールバックとして使える。
 */
export const requestIdle: (cb: IdleCallback) => void =
  typeof globalThis.requestIdleCallback === 'function'
    ? (cb) => globalThis.requestIdleCallback(cb)
    : (cb) => {
        setTimeout(() => cb({ timeRemaining: () => 8, didTimeout: true }), 0);
      };

/** 1 回のアイドルで使い切ってよい残り時間の下限（ms）。 */
const SLICE_FLOOR = 4;

/**
 * 配列を、アイドル時間の許す限り少しずつ処理する。
 *
 * 1 件ずつ `requestIdle` へ戻すと、件数が多いときにコールバックの往復が支配的になる。
 * 締切まで処理を続け、締切を過ぎた時点で次を予約する。
 */
export function processInIdle<T>(items: readonly T[], step: (item: T) => void): Promise<void> {
  if (items.length === 0) return Promise.resolve();

  return new Promise((resolve) => {
    let index = 0;
    const run = (deadline: IdleDeadline) => {
      do {
        const item = items[index];
        if (item === undefined) break;
        step(item);
        index++;
      } while (index < items.length && (deadline.timeRemaining() > SLICE_FLOOR || deadline.didTimeout));

      if (index < items.length) requestIdle(run);
      else resolve();
    };
    requestIdle(run);
  });
}
