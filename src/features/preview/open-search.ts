/**
 * プレビュー内検索を開く入口（F-VIEW-10）。
 *
 * 呼び出し元が 2 つある（`Ctrl+F` のキーバインドと、ハンバーガーメニューの項目）ため、動的 import の 1 行だけを持つモジュールとして切り出してある。
 * どちらかに実装してもう一方から呼ぶと、`app/` と `features/menu/` の間に参照が生じて依存の向きが崩れる。
 *
 * ここに置いても `search` チャンクは遅延のままであり、動的 import が実行されるまで読み込まれない。
 */
const PREVIEW_SELECTOR = '#mx-preview';

/**
 * 検索パネルを開き、閉じるための関数を返す。
 *
 * 閉じる関数を返すのは、Edit へ切り替えたときにパネルを閉じる必要があるためである（`features/mode/find.ts`）。
 * パネルは `document.body` にあるため、閉じないと非表示の面の上に残り、`F3` / `Escape` がエディター側の検索と競合する。
 *
 * 閉じる側もこの入口を通す。
 * `mode.ts` から `./lazy/search` を import すると、一度も検索していない起動でも `search` チャンクが読み込まれる。
 */
export async function openSearchLazily(): Promise<(() => void) | null> {
  const container = document.querySelector<HTMLElement>(PREVIEW_SELECTOR);
  if (!container) return null;
  const { openSearch, closeSearch } = await import('./lazy/search');
  openSearch(container);
  return closeSearch;
}
