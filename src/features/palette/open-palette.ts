/**
 * コマンドパレットを開く入口（`Ctrl+Shift+P` / F-NAV-06）。
 *
 * 動的 import の 1 行だけを持つモジュールとして切り出してある（`outline/open-jump.ts` と同じ形）。
 * ここに置いても `palette` チャンクは遅延のままであり、押されるまで読み込まれない。
 */
/** コマンドパレットを開く。`palette` チャンクはここで初めて読み込まれる。 */
export async function openCommandPaletteLazily(): Promise<void> {
  const { openCommandPalette } = await import('./lazy/command-palette');
  openCommandPalette();
}
