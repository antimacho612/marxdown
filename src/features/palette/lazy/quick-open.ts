/**
 * クイックオープンの出し入れ（`Ctrl+P`）。
 *
 * このモジュールから先が遅延チャンクになる。コマンドパレットと同じ `palette` チャンクに入るので、
 * 一度どちらかを開けば、もう一方は読み込み済みになる。
 */
import { openPalette } from './host';
import QuickOpen from './QuickOpen.svelte';

/** クイックオープンを開く。既に開いていれば入力欄を選び直す。 */
export function openQuickOpen(): void {
  openPalette('quick-open', QuickOpen, {});
}
