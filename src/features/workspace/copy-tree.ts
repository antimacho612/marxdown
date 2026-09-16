/**
 * ディレクトリ構造のコピーの入口（`main` チャンク）。
 * 動的 import の一行だけを持つ（`features/editor/open-editor.ts` と同じ形）。
 */
import { treeStore } from './tree.svelte';

/**
 * ディレクトリ構造をアスキーアートにしてクリップボードへコピーする（`explorer.copyTree`）。
 *
 * 対象を省略すると基点を使う。基点が決まっていなければ何もしない。
 * 対象を渡すのは Explorer の右クリックで、そのディレクトリから下だけを描く。
 */
export async function copyTreeLazily(path?: string): Promise<void> {
  const target = path ?? treeStore.root;
  if (target === null) return;

  const { copyTree } = await import('./lazy/copy-tree');
  await copyTree(target);
}
