/**
 * Explorer を出してフォーカスする（`Ctrl+Shift+E` / 03.ux-spec/06-panes.md §4）。
 *
 * トグルにしないのは §4 の決定で、常に同じ結果を返すためである（閉じるのはペイン側の `Ctrl+Shift+B`）。
 * `features/outline/show.ts` と対になる。
 *
 * フォーカス先の DOM 要素は `FileTree.svelte` だけが知っているため、そちらから登録してもらう。
 */
import { tick } from 'svelte';

import { openLeftPane } from '@/features/panes';

let focusTree: (() => void) | null = null;

/** ペインを開いた時点でツリーがまだ読み込まれていない。登録され次第フォーカスする。 */
let pending = false;

/**
 * `FileTree.svelte` が自分のフォーカス手段を登録する口。
 * ペインを閉じる（＝コンポーネントが消える）ときに `null` を渡す。
 */
export function registerExplorerFocus(focus: (() => void) | null): void {
  focusTree = focus;
  if (focus === null || !pending) return;
  pending = false;
  focus();
}

/**
 * Explorer を表示してフォーカスする。閉じる動作は持たない。
 *
 * ファイルツリーは遅延チャンクにあるため（`Explorer.svelte`）、初回は Svelte の更新 1 回では間に合わない。
 * その場合は要求を覚えておき、読み込まれた時点でフォーカスする。
 */
export async function showExplorer(): Promise<void> {
  openLeftPane();
  await tick();
  if (focusTree === null) {
    pending = true;
    return;
  }
  focusTree();
}
