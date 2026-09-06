/**
 * history feature の公開面（02.architecture/03-layers.md §2）。
 *
 * 遅延チャンクを持たない。`Alt+←` は起動直後から効く必要がある。
 * 配列とカーソルの操作（`stepHistory` / `revertHistoryStep` / 件数の上限）は
 * feature 内の都合で、外から履歴を書き換える経路は作らない。
 */
export { canGoBack, canGoForward, pushHistory } from './history';
export { configureHistory, goBack, goForward, type HistoryNavigator } from './navigate';
