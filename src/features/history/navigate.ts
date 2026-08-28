/**
 * 戻る / 進む（`Alt+←` / `Alt+→` / F-NAV-07）。
 *
 * 履歴そのもの（配列とカーソル）は `history.ts`。ここは「開き直す」担当で、
 * 分けているのは `open.ts` との循環参照を避けるため。
 */
import { openPath, previewScrollTop } from '@/features/document/open';

import { revertHistoryStep, stepHistory } from './history';

// 呼ぶ側（キーバインド / メニュー）から見て、履歴の入口はここ 1 つでよい。
export { canGoBack, canGoForward } from './history';

export function goBack(): Promise<void> {
  return step(-1);
}

export function goForward(): Promise<void> {
  return step(1);
}

/**
 * 履歴を 1 段辿る。
 *
 * **スクロール位置も一緒に戻す**（06.roadmap/m1.5-shell-and-settings.md §2）。戻った先が先頭から
 * 始まると、長い文書では「どこを読んでいたか」を探し直すことになる。
 * 仕組みは `F5`（`reloadCurrent`）と同じ `restoreScroll` で、
 * 段階的描画で高さが足りないぶんも `open.ts` が面倒を見る。
 */
async function step(delta: -1 | 1): Promise<void> {
  const target = stepHistory(delta, previewScrollTop());
  if (!target) return;

  const outcome = await openPath(target.path, {
    resetScroll: false,
    restoreScroll: target.scrollTop,
    // 履歴を辿る移動そのものは履歴に積まない（積むと二度と抜け出せない）。
    history: false,
    // 最近開いたファイル（F-OPEN-09）の順序は「最後に開いた順」であって
    // 「最後に見た順」ではない。戻っただけで先頭に来ると、一覧が履歴の影になる。
    remember: false,
  });

  // 開けなかった（消された / 移動された）。押した回数と段数を合わせ直す。
  // 何が起きたかの通知は `openPath` が既に出している。
  if (!outcome) revertHistoryStep(delta);
}
