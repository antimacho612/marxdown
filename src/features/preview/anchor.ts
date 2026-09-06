/**
 * ページ内アンカーへのスクロール（F-VIEW-07）。
 *
 * 呼ぶ側が 2 つある。
 *
 * - 本文中の `#anchor` クリック（`links.ts`）
 * - `./other.md#section` で開いた直後の着地（`open.ts`）
 *
 * 片方に実装してもう一方から呼ぶと、`features/document/` と `features/preview/` の間に参照が生じて依存の向きが崩れる（`open-search.ts` と同じ理由）。
 */

/**
 * container の中の `id` / `name` へスクロールする。見つかったかどうかを返す。
 *
 * `getElementById` ではなく container の中を探すのは、シェル側の要素に同じ id があった場合に本文の外へ移動しないようにするためである。
 *
 * 段階的描画では、飛び先がまだ DOM に入っていないことがある。
 * 呼び出し側が「入り終わったらもう一度」と判断できるよう、失敗を返り値で伝える。
 */
export function scrollToAnchor(container: HTMLElement, rawId: string): boolean {
  const id = safeDecode(rawId);
  if (id === '') return false;

  const target =
    container.querySelector(`[id="${cssEscape(id)}"]`) ?? container.querySelector(`[name="${cssEscape(id)}"]`);
  if (!target) return false;

  target.scrollIntoView({ block: 'start', behavior: 'auto' });
  return true;
}

/** `decodeURIComponent` を通す。不正な入力ならそのまま返す。 */
export function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** `CSS.escape` は WebView2 にあるが、テスト環境（jsdom）に無い場合がある。 */
function cssEscape(value: string): string {
  return typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(value)
    : value.replace(/["\\]/g, '\\$&');
}
