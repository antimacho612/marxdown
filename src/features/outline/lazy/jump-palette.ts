/**
 * 見出しジャンプのパレットの出し入れ（`Ctrl+Shift+O`）。
 *
 * このモジュールから先が遅延チャンクになる（`assets/outline-*.js`）。
 * 起動時には読み込まれず、`Ctrl+Shift+O` を押した時点で初めて読み込まれる。
 *
 * 出し入れそのものは `features/palette/lazy/host.ts` が持つ（コマンドパレットと共有）。
 * 同時に開けるのは 1 つだけで、別のパレットを開くと先に開いていたほうは閉じる。
 */
import { openPalette } from '@/features/palette/lazy/host';

import JumpPalette from './JumpPalette.svelte';

/** 見出しジャンプのパレットを開く。既に開いていれば入力欄を選び直す。 */
export function openJumpPalette(): void {
  openPalette('jump', JumpPalette, {});
}
