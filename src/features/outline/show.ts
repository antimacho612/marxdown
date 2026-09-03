/**
 * Outline を出してフォーカスする（`Ctrl+Shift+U` / 03.ux-spec/06-panes.md §4）。
 * トグルにしないのは §4 の決定で、常に同じ結果を返すためである（閉じるのはペイン側の `Ctrl+Alt+B`）。
 * 将来アウトラインを左ペインへ移すときも `openRightPane()` を差し替えるだけで済む。
 *
 * フォーカス先の DOM 要素は `Outline.svelte` だけが知っているため、ここから `querySelector` で探さず `Outline.svelte` 側から登録してもらう（`features/document/refresh.ts` の `registerSearchRefresher` と同じ形）。
 */
import { tick } from 'svelte';

import { openRightPane } from '@/features/panes/panes';

let focusOutline: (() => void) | null = null;

/**
 * `Outline.svelte` が自分のフォーカス手段を登録する口。
 * ペインを閉じる（＝コンポーネントが消える）ときに `null` を渡す。
 */
export function registerOutlineFocus(focus: (() => void) | null): void {
  focusOutline = focus;
}

/**
 * Outline を出してフォーカスする。**閉じない。**
 *
 * ペインを開いた直後はコンポーネントがまだ生えていないので、
 * Svelte の更新を 1 回待ってからフォーカスする。
 */
export async function showOutline(): Promise<void> {
  openRightPane();
  await tick();
  focusOutline?.();
}
