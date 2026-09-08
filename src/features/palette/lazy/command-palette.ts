/**
 * コマンドパレットの出し入れ（`Ctrl+Shift+P`）。
 *
 * このモジュールから先が遅延チャンクになる。起動時には読み込まれず、押した時点で初めて読み込まれる。
 * 出し入れそのものは `host.ts` が持つ（見出しジャンプと共有）。
 */
import CommandPalette from './CommandPalette.svelte';
import { openPalette } from './host';

/** コマンドパレットを開く。既に開いていれば入力欄を選び直す。 */
export function openCommandPalette(): void {
  openPalette('command', CommandPalette, {});
}
