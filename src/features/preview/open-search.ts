/**
 * プレビュー内検索を開く入口（F-VIEW-10）。
 *
 * 呼ぶ側が 2 つある（`Ctrl+F` のキーバインドと、ハンバーガーメニューの項目）ため、
 * **動的 import の一行だけを持つモジュール**として切り出してある。
 * どちらかに書いてもう一方から呼ぶと、`app/` と `features/menu/` のあいだに
 * 参照が生えて向きが濁る。
 *
 * ここに置いても `search` チャンクは遅延のまま。動的 import が実行されるまで
 * 何もロードされない。
 */
const PREVIEW_SELECTOR = '#mx-preview';

/**
 * 開く。**閉じる手段を返す。**
 *
 * 返すのは、Edit へ切り替えたときにパネルを閉じる必要があるため
 * （`features/mode/find.ts`）。パネルは `document.body` にあるので、
 * 放っておくと隠れた面の上に浮いたまま残り、`F3` / `Escape` が
 * エディター側の検索と食い合う。
 *
 * **閉じる側もこの入口を通す。** `mode.ts` から `./search` を import すると、
 * 一度も検索していない起動でも `search` チャンクが落ちてくる。
 */
export async function openSearchLazily(): Promise<(() => void) | null> {
  const container = document.querySelector<HTMLElement>(PREVIEW_SELECTOR);
  if (!container) return null;
  const { openSearch, closeSearch } = await import('./search');
  openSearch(container);
  return closeSearch;
}
