/**
 * Outline を**出してフォーカスする**（`Ctrl+Shift+U` / 03.ux-spec/06-panes.md §4）。
 *
 * # なぜトグルではないのか
 *
 * §4 の決定そのもの。「アウトラインを見たい」という意図に対して**常に同じ結果**
 * を返すため、開いていても閉じない。閉じるのはペイン側のキー（`Ctrl+Alt+B`）の仕事。
 *
 * この分け方は、将来アウトラインを左ペインへ移したときに効く。移すときに直すのは
 * **このファイルの `openRightPane()` を `openLeftPane()` に変える 1 行だけ**で、
 * キーの意味も、ペイン側のコードも変わらない。
 *
 * # フォーカスの当て先はコンポーネントが決める
 *
 * 「アウトラインの現在位置」がどの DOM 要素かを知っているのは
 * `Outline.svelte` だけ。ここから `querySelector` で探しに行くと、
 * マークアップを変えるたびにこちらが壊れる。**向こうから名乗り出てもらう**
 * （`open.ts` の `registerSearchRefresher` と同じ形）。
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
