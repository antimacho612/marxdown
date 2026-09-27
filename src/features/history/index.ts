/**
 * history feature の公開面。
 *
 * 遅延チャンクは持たない。`Alt+←` は起動直後から動作する必要がある。
 * 配列とカーソルの操作（`stepHistory` / `revertHistoryStep` / 件数の上限）は feature 内部の関心事であり、外から履歴を書き換える経路は、ファイルのリネーム・移動に伴うパスの付け替え（`relocateHistory`）だけである。
 */
export { canGoBack, canGoForward, dropHistory, pushHistory, relocateHistory } from './history';
export { configureHistory, goBack, goForward, type HistoryNavigator } from './navigate';
