/**
 * アウトラインから本文の見出しへ飛ぶ（F-VIEW-02 / 03.ux-spec/06-panes.md §2）。
 *
 * `id`（`markdown-it-anchor`）は記号だけの見出しで空になりうるうえ重複連番が Markdown 側の都合で変わるため、行に 1 ブロックしか始まらず一意な `data-line`（`line-map.ts`）を優先し、`id` は保険として後ろに置く。
 */
import { jumpToEditorLine } from '@/features/view/scroll-sync';
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
  // Split では**両方が該当見出しへ**動く（03.ux-spec/03-split-mode.md §3）。
  // エディターが載っていなければ何も起きない。
  //
  // **フォーカスは移さない。** 続けて次の見出しを選べなくなる。
  // `item.line` は 0 始まり（`line-map.ts`）、エディターは 1 始まり。
  jumpToEditorLine(item.line + 1, { focus: false });

  const container = document.querySelector<HTMLElement>(PREVIEW_SELECTOR);
  const target = findHeading(container, item);
  if (!target) return;

  // 03.ux-spec/09-motion.md「スクロールジャンプ 200ms / `prefers-reduced-motion` で無効」。
  // 位置の変化が大きいほど、飛んだ先が本文のどこなのか分からなくなる。
  target.scrollIntoView({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
}

function findHeading(container: HTMLElement | null, item: OutlineItem): HTMLElement | null {
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
