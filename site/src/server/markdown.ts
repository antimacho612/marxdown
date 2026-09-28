/**
 * ビルド時の Markdown の描画。
 *
 * パースはアプリ本体の `markdown/pipeline.ts` をそのまま使う。
 * アプリが表示後に行う処理のうち、シンタックスハイライトと数式だけをここで済ませ、Mermaid はブラウザ側に残す（レイアウトの計測が要るため）。
 * 入力はこのリポジトリに置いた文書だけなので、DOMPurify は通さない。
 */
import hljs from 'highlight.js';
import { JSDOM } from 'jsdom';
import { renderToString } from 'katex';

import { loadSyntax, render, resetMarkdownIt, type SyntaxName } from '@/markdown/pipeline';
import type { OutlineItem } from '@/markdown/plugins/line-map';

export interface MarkdownOptions {
  /** 有効にする追加記法（`markdown.*`）。 */
  syntax?: readonly SyntaxName[];
}

/** KaTeX の指定。アプリの `features/preview/lazy/math.ts` と同じ値にしてある。 */
const KATEX_OPTIONS = {
  throwOnError: false,
  trust: false,
  strict: 'ignore',
  maxSize: 100,
  maxExpand: 1000,
} as const;

const LANGUAGE_CLASS = /(?:^|\s)language-([\w+#-]+)/;

export interface RenderedMarkdown {
  html: string;
  outline: OutlineItem[];
  frontMatter: string | null;
}

/** Markdown を、アプリのプレビューと同じ HTML にする。見出しの一覧と Front Matter も返す。 */
export async function renderDocument(source: string, options: MarkdownOptions = {}): Promise<RenderedMarkdown> {
  const syntax = options.syntax ?? [];
  if (syntax.length > 0) {
    await loadSyntax(syntax);
    resetMarkdownIt();
  }
  const result = render(source, { syntax });
  return { html: enhance(result.html), outline: result.outline, frontMatter: result.frontMatter };
}

/** Markdown を、アプリのプレビューと同じ HTML にする。 */
export async function renderMarkdown(source: string, options: MarkdownOptions = {}): Promise<string> {
  const { html } = await renderDocument(source, options);
  return html;
}

function enhance(html: string): string {
  const { document } = new JSDOM(`<body>${html}</body>`).window;

  for (const code of document.querySelectorAll('pre > code')) {
    const language = LANGUAGE_CLASS.exec(code.className)?.[1];
    if (language === undefined || hljs.getLanguage(language) === undefined) continue;
    code.innerHTML = hljs.highlight(code.textContent ?? '', { language, ignoreIllegals: true }).value;
  }

  for (const element of document.querySelectorAll<HTMLElement>('[data-mx-math]')) {
    element.innerHTML = renderToString(element.textContent ?? '', {
      ...KATEX_OPTIONS,
      displayMode: element.dataset['mxMath'] !== 'inline',
    });
    element.dataset['mxMathRendered'] = '';
  }

  // タスクリストの印はアプリでは押して切り替えられるが、サイトでは押しても何も起きない。フォーカスの対象から外す。
  for (const task of document.querySelectorAll('.mx-task')) task.removeAttribute('tabindex');

  // NOTE: jsdom は `getHTML()` を実装していない。
  // eslint-disable-next-line unicorn/prefer-dom-node-html-methods
  return document.body.innerHTML;
}

const escapeHtml = (text: string): string =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

const span = (className: string, text: string): string => `<span class="${className}">${escapeHtml(text)}</span>`;

/**
 * 行の中の記法。先に書いたものが優先される。
 *
 * 強調の `_` は語の途中では扱わない（`t_m` を強調にしない）。CommonMark と同じ扱いである。
 */
const INLINE =
  /(?<code>(?<ticks>`+).*?\k<ticks>)|(?<strong>\*\*[^*]+\*\*)|(?<em>(?<![\w*])\*[^*\s][^*]*?\*(?![\w*])|(?<![\w_])_[^_\s][^_]*?_(?![\w_]))|(?<link>!?\[[^\]]*\])(?<url>\([^)]*\))|(?<tag><\/?[a-zA-Z][^>]*>)|(?<footnote>\[\^[^\]]+\])/g;

/** 行の中の記法ごとの色。`INLINE` の名前付きグループと対応する。 */
const INLINE_CLASSES = {
  code: 'hljs-code',
  strong: 'hljs-strong',
  em: 'hljs-emphasis',
  tag: 'hljs-tag',
  footnote: 'hljs-link',
} as const;

function highlightInline(text: string): string {
  let html = '';
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    const groups = match.groups ?? {};
    html += escapeHtml(text.slice(last, match.index));
    if (groups['link'] === undefined) {
      const kind = (Object.keys(INLINE_CLASSES) as (keyof typeof INLINE_CLASSES)[]).find(
        (name) => groups[name] !== undefined,
      );
      html += span(INLINE_CLASSES[kind ?? 'code'], match[0]);
    } else {
      html += escapeHtml(groups['link']) + span('hljs-link', groups['url'] ?? '');
    }
    last = match.index + match[0].length;
  }
  return html + escapeHtml(text.slice(last));
}

function highlightLine(line: string): string {
  const heading = /^#{1,6}\s/.exec(line);
  if (heading) return span('hljs-section', line);
  if (/^\s*>/.test(line)) return span('hljs-quote', line);
  if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) return span('hljs-bullet', line);
  if (line.trimStart().startsWith('|')) {
    return line
      .split(/(\|)/)
      .map((part) => (part === '|' ? span('md-pipe', part) : highlightInline(part)))
      .join('');
  }
  const list = /^(\s*)([-*+]|\d+[.)])(\s+)(\[[ xX]\]\s+)?/.exec(line);
  if (list) {
    const [whole, indent = '', marker = '', space = '', task = ''] = list;
    return `${indent}${span('hljs-bullet', marker)}${space}${task ? span('hljs-bullet', task) : ''}${highlightInline(line.slice(whole.length))}`;
  }
  const definition = /^\[\^[^\]]+\]:/.exec(line);
  if (definition) return span('hljs-link', definition[0]) + highlightInline(line.slice(definition[0].length));
  return highlightInline(line);
}

/**
 * Markdown のソースを、エディターの見た目に近い色付きの行に分ける。
 *
 * 画面のエディター（Monaco）の定義そのものではなく、行ごとの簡単な規則で近似している。
 * フェンスの中は、言語が分かれば highlight.js で色を付ける。
 */
export function highlightSource(source: string): string[] {
  const lines = source.split('\n');
  const out: string[] = [];
  let fence: { marker: string; language: string; body: string[] } | undefined;
  let frontMatter = lines[0] === '---';

  for (const [index, line] of lines.entries()) {
    if (frontMatter) {
      out.push(span('hljs-quote', line));
      if (index > 0 && line === '---') frontMatter = false;
      continue;
    }
    if (fence) {
      if (line.trimStart().startsWith(fence.marker)) {
        const code = fence.body.join('\n');
        const known = fence.language !== '' && hljs.getLanguage(fence.language) !== undefined;
        out.push(
          ...(known
            ? splitHighlightedLines(hljs.highlight(code, { language: fence.language, ignoreIllegals: true }).value)
            : fence.body.map((text) => escapeHtml(text))),
          span('hljs-code', line),
        );
        fence = undefined;
      } else {
        fence.body.push(line);
      }
      continue;
    }
    const open = /^\s*(`{3,}|~{3,})\s*([\w+#-]*)/.exec(line);
    if (open) {
      fence = { marker: open[1] ?? '```', language: open[2] ?? '', body: [] };
      out.push(span('hljs-code', line));
      continue;
    }
    out.push(highlightLine(line));
  }
  if (fence) out.push(...fence.body.map((text) => escapeHtml(text)));
  return out;
}

/**
 * ハイライト済みの HTML を行ごとに分ける。
 *
 * 複数行にまたがる `<span>` は、行の境界でいったん閉じて次の行で開き直す。
 */
export function splitHighlightedLines(html: string): string[] {
  const lines: string[] = [];
  const open: string[] = [];
  let current = '';

  for (const part of html.split(/(<span[^>]*>|<\/span>|\n)/)) {
    if (part === '\n') {
      lines.push(current + '</span>'.repeat(open.length));
      current = open.join('');
    } else if (part.startsWith('<span')) {
      open.push(part);
      current += part;
    } else if (part === '</span>') {
      open.pop();
      current += part;
    } else {
      current += part;
    }
  }
  lines.push(current + '</span>'.repeat(open.length));
  return lines;
}
