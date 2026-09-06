/**
 * 見出しジャンプを開く入口（`Ctrl+Shift+O` / 03.ux-spec/04-keybindings.md §3）。
 *
 * 呼び出し元が 2 つある（キーバインドと、ハンバーガーメニューの項目）ため、動的 import の 1 行だけを持つモジュールとして切り出してある。
 * `open-search.ts` / `open-settings.ts` と同じ形であり、理由も同じである。
 *
 * ここに置いても `outline` チャンクは遅延のままであり、操作されるまで読み込まれない。
 */
/** 見出しジャンプのパレットを開く。`outline` チャンクはここで初めて読み込まれる。 */
export async function openJumpLazily(): Promise<void> {
  const { openJumpPalette } = await import('./lazy/jump-palette');
  openJumpPalette();
}
