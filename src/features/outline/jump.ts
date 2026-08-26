/**
 * アウトラインから本文の見出しへ飛ぶ（F-VIEW-02 / 03.ux-spec.md §7.2）。
 *
 * # `data-line` で引く
 *
 * 見出しには `markdown-it-anchor` が付けた `id` もあるが、**空になりうる**
 * （記号だけの見出し）うえ、重複時の連番は Markdown 側の都合で変わる。
 * `data-line`（`line-map.ts`）は 1 行に 1 ブロックしか始まらないので一意で、
 * 02.architecture.md §6.3 が「アウトラインからのジャンプ」を載せている土台そのもの。
 * `id` は保険として後ろに置く。
 */
import type { OutlineItem } from '@/markdown/plugins/line-map';

const PREVIEW_SELECTOR = '#mx-preview';
const HEADINGS = 'h1, h2, h3, h4, h5, h6';

/**
 * 見出しへスクロールする。見つからなければ何もしない。
 *
 * 段階的描画の途中では、まだ DOM に無い見出しがある。押しても動かないのは
 * 通知するほどのことではない（数百 ms 後には入っている）。
 */
export function jumpToHeading(item: OutlineItem): void {
  const container = document.querySelector<HTMLElement>(PREVIEW_SELECTOR);
  const target = findHeading(container, item);
  if (!target) return;

  // §10「スクロールジャンプ 200ms / `prefers-reduced-motion` で無効」。
  // 位置の変化が大きいほど、飛んだ先が本文のどこなのか分からなくなる。
  target.scrollIntoView({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
}

export function findHeading(container: HTMLElement | null, item: OutlineItem): HTMLElement | null {
  if (!container) return null;

  const byLine = container.querySelector<HTMLElement>(`:is(${HEADINGS})[data-line="${item.line}"]`);
  if (byLine) return byLine;

  if (item.slug === '') return null;
  return container.querySelector<HTMLElement>(`:is(${HEADINGS})[id="${cssEscape(item.slug)}"]`);
}

function prefersReducedMotion(): boolean {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/** `CSS.escape` は WebView2 にあるが、テスト環境（jsdom）に無い場合がある（`links.ts` と同じ）。 */
function cssEscape(value: string): string {
  return typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(value)
    : value.replace(/["\\]/g, '\\$&');
}
