/**
 * 戻る / 進む（`Alt+←` / `Alt+→` / F-NAV-07）。
 *
 * 履歴そのもの（配列とカーソル）は `history.ts` が持ち、ここは開き直しを担当する。
 * 開き直しの実体は `document/open.ts` にあるが、そちらは履歴へ積むためにこの feature を参照している。
 * 直接呼び返すと feature 単位で循環するため、必要な処理は `app/bootstrap.ts` から注入を受ける（`configureOpener` と同じ形）。
 */
import { revertHistoryStep, stepHistory } from './history';

/** 履歴を辿るために外部から注入する処理。起動時に 1 回だけ渡す。 */
export interface HistoryNavigator {
  /** 現在のスクロール位置。離れる直前に記録する。 */
  scrollTop: () => number;
  /** 行き先を開き直す。開けなければ false。 */
  reopen: (path: string, scrollTop: number) => Promise<boolean>;
}

let navigator: HistoryNavigator | null = null;

/** 履歴の移動に使う処理を注入する。起動時に 1 回だけ呼ぶ。 */
export function configureHistory(next: HistoryNavigator): void {
  navigator = next;
}

/** 1 つ戻る（`Alt+←`）。`key` は辿る対象のタブ（`features/workspace`）。 */
export function goBack(key: number | null): Promise<void> {
  return step(key, -1);
}

/** 1 つ進む（`Alt+→`）。 */
export function goForward(key: number | null): Promise<void> {
  return step(key, 1);
}

/**
 * 履歴を 1 段辿る。
 *
 * スクロール位置も併せて復元する（06.roadmap/m1.5-shell-and-settings.md §2）。
 * 移動先が先頭から表示されると、長い文書では読んでいた位置を探し直すことになる。
 * 仕組みは `F5`（`reloadCurrent`）と同じ `restoreScroll` であり、段階的描画で高さが足りない場合の再設定も `open.ts` が担当する。
 */
async function step(key: number | null, delta: -1 | 1): Promise<void> {
  if (!navigator) throw new Error('configureHistory が呼ばれていない');

  const target = stepHistory(key, delta, navigator.scrollTop());
  if (!target) return;

  const opened = await navigator.reopen(target.path, target.scrollTop);

  // 開けなかった場合（削除された、または移動された）。操作回数と移動段数を一致させ直す。
  // 失敗の通知は `openPath` が既に出している。
  if (!opened) revertHistoryStep(key, delta);
}
