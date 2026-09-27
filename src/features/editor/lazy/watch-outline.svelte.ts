/**
 * 見出しの入れ替わりを購読する（`editor` チャンク / `folding.ts`）。
 * ルーン（`$effect.root`）を使うため分けてあり、`folding.ts` は素の `.ts` のままテストできる。
 */
import { documentStore } from '@/features/document';

/**
 * `documentStore.outline` が入れ替わるたびに `changed` を呼ぶ。解除する関数を返す。
 *
 * マウント直後にも 1 回呼ばれる。受け取る側（Monaco の `onDidChange`）は範囲を作り直すだけなので問題はない。
 */
export function watchOutline(changed: () => void): () => void {
  return $effect.root(() => {
    $effect(() => {
      void documentStore.outline;
      changed();
    });
  });
}
