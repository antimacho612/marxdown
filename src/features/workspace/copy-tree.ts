/**
 * ディレクトリ構造のコピーの入口（`main` チャンク）。
 * 動的 import の一行だけを持つ（`features/editor/open-editor.ts` と同じ形）。
 */
import { treeStore } from './tree.svelte';

/**
 * ディレクトリ構造をアスキーアートにしてクリップボードへコピーする（`explorer.copyTree`）。
 *
 * 対象を省略すると基点を使う。基点が決まっていなければ何もしない。
 * 右クリックメニューは `lazy/actions.ts` の `copyTree` を直接呼ぶため、ここを通るのはコマンドパレットからの実行だけである。
 */
export async function copyTreeLazily(path?: string): Promise<void> {
  const target = path ?? treeStore.root;
  if (target === null) return;

  const { copyTree } = await import('./lazy/actions');
  await copyTree(target);
}
