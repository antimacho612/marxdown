/**
 * Mermaid の図を、画面に入ったときにブラウザで描く。
 *
 * アプリの `features/preview/lazy/mermaid.ts` は `#mx-preview` の背景色で明暗を決めるため、見本が何枚もあるこのサイトでは使えない。
 * 図ごとに置かれた面の背景色で明暗を決め、図の先頭の指定でその図にだけ適用する（アプリの書き出しと同じ方法）。
 * 生成した SVG は、アプリと同じサニタイザを通してから入れる。
 */
import type mermaid from 'mermaid';

import '@/styles/preview/mermaid.css';

let engine: Promise<typeof mermaid> | undefined;
let sequence = 0;
const sources = new WeakMap<HTMLElement, string>();

async function initialize(): Promise<typeof mermaid> {
  const { default: module } = await import('mermaid');
  module.initialize({ startOnLoad: false, securityLevel: 'strict', htmlLabels: false });
  return module;
}

async function load(): Promise<typeof mermaid> {
  engine ??= initialize();
  return engine;
}

function isDark(element: HTMLElement): boolean {
  const surface = element.closest<HTMLElement>('.mx-preview') ?? document.body;
  const matched = /(\d+)\D+(\d+)\D+(\d+)/.exec(getComputedStyle(surface).backgroundColor);
  if (!matched) return false;
  const [r, g, b] = [Number(matched[1]), Number(matched[2]), Number(matched[3])];
  return 0.299 * r + 0.587 * g + 0.114 * b < 128;
}

async function draw(element: HTMLElement): Promise<void> {
  const source = sources.get(element) ?? element.textContent ?? '';
  sources.set(element, source);
  element.dataset['mxMermaidState'] = 'pending';

  const [mermaid, { sanitizeSvg }] = await Promise.all([load(), import('@/markdown/sanitize')]);
  const font = getComputedStyle(element).getPropertyValue('--mx-font-content').trim();
  const directive = `%%{init: {"theme": "${isDark(element) ? 'dark' : 'default'}", "fontFamily": ${JSON.stringify(font)}}}%%\n`;

  sequence += 1;
  const id = `site-mermaid-${sequence}`;
  try {
    const { svg } = await mermaid.render(id, directive + source);
    element.innerHTML = sanitizeSvg(svg);
    element.dataset['mxMermaidState'] = 'done';
  } catch {
    element.dataset['mxMermaidState'] = 'error';
  } finally {
    document.querySelector(`#d${id}`)?.remove();
  }
}

/** `root` の中の図を監視し、画面の近くに来たものから描く。外観を切り替えたら描き直す。 */
export function observeMermaid(root: ParentNode = document): void {
  const elements = [...root.querySelectorAll<HTMLElement>('.mx-mermaid')];
  if (elements.length === 0) return;

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        void draw(entry.target as HTMLElement);
      }
    },
    { rootMargin: '300px' },
  );
  for (const element of elements) observer.observe(element);

  const redraw = () => {
    for (const element of elements) if (element.dataset['mxMermaidState'] === 'done') void draw(element);
  };
  document.addEventListener('site:themechange', redraw);
  document.addEventListener('site:surfacechange', redraw);
  globalThis.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', redraw);
}
