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

export async function openSearchLazily(): Promise<void> {
  const container = document.querySelector<HTMLElement>(PREVIEW_SELECTOR);
  if (!container) return;
  const { openSearch } = await import('./search');
  openSearch(container);
}
