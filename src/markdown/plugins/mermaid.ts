/**
 * Mermaid のフェンスをプレースホルダにする markdown-it プラグイン（F-VIEW-12 / 04.tech-stack/04-markdown.md §4）。
 *
 * `math.ts` と同じ立場で、ここは記法を見分けるだけで Mermaid を呼ばない。
 * Mermaid は全依存の中で突出して重く、pipeline チャンクはクリティカルパスにある。
 *
 * `fence` トークンの型を差し替えるだけにしてある。
 * 独自のブロックルールを足すと、コードフェンスの終端判定を二重に持つことになる。
 *
 * `lineMapPlugin` より前に `use` すること（`data-line` はあちらが付ける）。
 */
import type { MarkdownIt, Token } from 'markdown-it';

/** フェンスの言語指定。大文字と前後の空白は無視する。 */
const INFO = 'mermaid';

/**
 * `mermaid` フェンスをプレースホルダとして出力する（F-VIEW-12）。
 *
 * プレースホルダは元の記述をテキストとして持つ。
 * 描画される前と、描画に失敗したときは、その記述が読める状態で残る（N-REL-04）。
 */
export function mermaidPlugin(md: MarkdownIt): void {
  md.core.ruler.push('mermaid_block', (state) => {
    for (const token of state.tokens) {
      if (token.type === 'fence' && token.info.trim().toLowerCase() === INFO) {
        token.type = 'mermaid_block';
      }
    }
    return true;
  });

  const escape = md.utils.escapeHtml;

  md.renderer.rules['mermaid_block'] = (tokens: Token[], idx: number): string =>
    `<div class="mx-mermaid">${escape(tokens[idx]?.content ?? '')}</div>\n`;
}
