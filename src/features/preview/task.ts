/**
 * プレビュー上のタスクリスト操作（F-VIEW-01）。
 *
 * 押されたことを受けて元の行番号を割り出すところまでがこの層の仕事で、テキストをどう書き換えるかは `document` 側が決める。
 * 依存の向きを `document → preview` の一方向に保つため、`links.ts` と同じく注入にしてある。
 *
 * 出力しているのは `<input>` ではなく `role="checkbox"` の `<span>` である（`markdown/plugins/task-list.ts`）。
 * そのため、チェック状態の描画とキーボード操作はこちらで扱う必要がある。
 */

/** チェックが押されたときの処理（`app/bootstrap.ts` が起動時に渡す）。 */
export interface TaskTargets {
  /**
   * その行のチェックを反転する。
   *
   * @param line 0 始まりの行番号。
   * @returns 反転後の状態。行がタスクリストの形をしていなければ `null`。
   */
  toggle: (line: number) => boolean | null;
}

let targets: TaskTargets | null = null;

/**
 * プレビュー内のクリックとキー操作を 1 か所で受ける。
 *
 * 個々の要素にハンドラを付けないのは `links.ts` と同じ理由である。
 * 段階的描画で後から追加される本文にも、最初から有効である。
 */
export function installTaskHandler(container: HTMLElement, next: TaskTargets): () => void {
  targets = next;

  const onClick = (event: MouseEvent) => {
    if (event.defaultPrevented) return;
    const box = (event.target as Element | null)?.closest('.mx-task');
    if (box instanceof HTMLElement) toggle(box);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    // `role="checkbox"` の作法に合わせる。Space が本来の操作で、Enter は追加の操作である。
    if (event.key !== ' ' && event.key !== 'Enter') return;

    const box = (event.target as Element | null)?.closest('.mx-task');
    if (!(box instanceof HTMLElement)) return;

    // Space はプレビューのスクロールでもある。チェックボックスの上でだけ既定動作を止める。
    event.preventDefault();
    toggle(box);
  };

  container.addEventListener('click', onClick);
  container.addEventListener('keydown', onKeyDown);

  return () => {
    container.removeEventListener('click', onClick);
    container.removeEventListener('keydown', onKeyDown);
    targets = null;
  };
}

/**
 * 1 つ反転する。
 *
 * 行番号は祖先のリスト項目が持つ `data-line` から取る（02.architecture/06-markdown-rendering-pipeline.md §3）。
 * 生 HTML で `<span class="mx-task">` と書かれていた場合、その行はタスクリストの形をしていないため `document` 側が `null` を返し、何も起きない。
 */
function toggle(box: HTMLElement): void {
  const item = box.closest('li[data-line]');
  const line = Number(item?.getAttribute('data-line'));
  if (!Number.isSafeInteger(line)) return;

  const checked = targets?.toggle(line);
  if (checked === null || checked === undefined) return;

  // テキストが真実であり、ここは押した結果をその場に映しているだけである（ADR-0002）。
  //
  // Split では `live.ts` の再描画が同じ結果を作り直すが、Preview だけを見ているときは再描画の契機が無い。
  // 押した瞬間に見た目が変わらないと、押せたのかどうかが分からない。
  box.setAttribute('aria-checked', String(checked));
}
