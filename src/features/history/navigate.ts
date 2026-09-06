/**
 * 戻る / 進む（`Alt+←` / `Alt+→` / F-NAV-07）。
 *
 * 履歴そのもの（配列とカーソル）は `history.ts`。ここは「開き直す」担当である。
 * 開き直しの実体は `document/open.ts` にあるが、あちらは履歴へ積むために
 * この feature を参照している。直接呼び返すと feature 単位で循環するため、
 * 外の手は `app/bootstrap.ts` から注入を受ける（`configureOpener` と同じ形）。
 */
import { revertHistoryStep, stepHistory } from './history';

/** 履歴を辿るのに要る外の手。起動時に 1 回だけ渡す。 */
export interface HistoryNavigator {
  /** いま読んでいる位置。離れる直前に控える。 */
  scrollTop: () => number;
  /** 行き先を開き直す。開けなければ false。 */
  reopen: (path: string, scrollTop: number) => Promise<boolean>;
}

let navigator: HistoryNavigator | null = null;

export function configureHistory(next: HistoryNavigator): void {
  navigator = next;
}

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
  if (!navigator) throw new Error('configureHistory が呼ばれていない');

  const target = stepHistory(delta, navigator.scrollTop());
  if (!target) return;

  const opened = await navigator.reopen(target.path, target.scrollTop);

  // 開けなかった（消された / 移動された）。押した回数と段数を合わせ直す。
  // 何が起きたかの通知は `openPath` が既に出している。
  if (!opened) revertHistoryStep(delta);
}
