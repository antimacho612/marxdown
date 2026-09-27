/**
 * Outline を出してフォーカスする（`Ctrl+Shift+U`）。
 * トグルにしないのは、常に同じ結果を返すためである（閉じるのはペイン側の `Ctrl+Alt+B`）。
 * 将来アウトラインを左ペインへ移すときも `openRightPane()` を差し替えるだけで済む。
 *
 * フォーカス先の DOM 要素は `Outline.svelte` だけが知っているため、ここから `querySelector` で探さず `Outline.svelte` 側から登録してもらう（`lib/refresh.ts` の `registerSearchRefresher` と同じ形）。
 */
import { tick } from 'svelte';

import { openRightPane } from '@/features/panes';

let focusOutline: (() => void) | null = null;

/**
 * `Outline.svelte` が自分のフォーカス手段を登録する関数。
 * ペインを閉じる（＝コンポーネントが消える）ときに `null` を渡す。
 */
export function registerOutlineFocus(focus: (() => void) | null): void {
  focusOutline = focus;
}

/**
 * Outline を表示してフォーカスする。閉じる動作は持たない。
 *
 * ペインを開いた直後はコンポーネントがまだマウントされていないため、Svelte の更新を 1 回待ってからフォーカスする。
 */
export async function showOutline(): Promise<void> {
  openRightPane();
  await tick();
  focusOutline?.();
}
