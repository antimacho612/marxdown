/**
 * 見出しジャンプを開く入口（`Ctrl+Shift+O` / 03.ux-spec/04-keybindings.md §3）。
 *
 * 呼ぶ側が 2 つある（キーバインドと、ハンバーガーメニューの項目）ため、
 * **動的 import の一行だけを持つモジュール**として切り出してある。
 * `open-search.ts` / `open-settings.ts` と同じ形で、理由も同じ。
 *
 * ここに置いても `outline` チャンクは遅延のまま。押されるまで何もロードされない。
 */
export async function openJumpLazily(): Promise<void> {
  const { openJumpPalette } = await import('./jump-palette');
  openJumpPalette();
}
