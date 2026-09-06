/**
 * markdown-it の構築（02.architecture/06-markdown-rendering-pipeline.md §1 / ADR-0003）。
 *
 * この層は文字列の変換だけを行い、DOM には触れない（サニタイズは `paint.ts` が呼ぶ DOMPurify の担当 / ADR-0006）。
 * プラグイン構成は 04.tech-stack/04-markdown.md §2 の既定に従う。
 * 脚注・タスクリスト・GitHub Alerts は M4 から M2 へ前倒し済みである（OQ-27 / 06.roadmap/m2-editor.md §1.4）。
 *
 * `use` の順序は仕様であり、`lineMapPlugin` を最後に置くこと。
 * `md.renderer.rules[...]` をその時点の中身ごと包むため、先に置くと後続プラグインの代入で上書きされる。
 */
import MarkdownItCallable, { type MarkdownIt, type Token } from 'markdown-it';
import anchor from 'markdown-it-anchor';
import footnote from 'markdown-it-footnote';
import githubAlerts from 'markdown-it-github-alerts';
import taskLists from 'markdown-it-task-lists';

import { splitFrontMatter } from './plugins/front-matter';
import { extractOutline, lineMapPlugin, type OutlineItem } from './plugins/line-map';

/** `render` の結果。HTML と、そこから導出した派生値をまとめて返す。 */
export interface RenderResult {
  html: string;
  outline: OutlineItem[];
  frontMatter: string | null;
  /** トップレベルブロックの数。段階的描画のチャンク分割に使う。 */
  blockCount: number;
}

let cached: MarkdownIt | null = null;

/** markdown-it を組み立てる。`use` の順序は仕様である（モジュール冒頭を参照）。 */
export function createMarkdownIt(): MarkdownIt {
  const md = new MarkdownItCallable({
    // 02.architecture/09-security.md §1 Layer 2: html は通すが、出力は必ず Layer 3 (DOMPurify) を通す。
    // ここで false にすると、生 HTML を書いた正当なドキュメントが壊れる。
    html: true,
    linkify: true, // GFM の自動リンク
    breaks: false, // CommonMark 準拠。改行を <br> にしない
    typographer: false, // 勝手な記号変換はしない（Markdown Is the Product）
  });

  // 見出しに id を付与するだけで、permalink（¶ リンク）は付けない。
  // 本文に無い記号を追加するのは Principle 2「Markdown Is the Product」に反する。
  md.use(anchor, { slugify: slugifyHeading });

  // GitHub Alerts（F-VIEW-14）。`> [!NOTE]` の blockquote を `alert_open` に書き換える。
  // タイトルは GitHub と同じ英語のままにする（Familiar）。
  // これは UI 文言ではなく本文の一部として描画されるものであるため、`i18n/ja.ts` の対象にしない。
  md.use(githubAlerts);

  // 脚注（F-VIEW-16）。生成されるブロックは本文の末尾に追加される。
  // チャンク分割はこのブロックの内側では行わない（`renderChunks`）。
  md.use(footnote);

  // タスクリスト（F-VIEW-01 の GFM 相当）。`<input type="checkbox" disabled>` を出力する。
  // 既定のまま disabled で出力する。
  // プレビュー上でチェックを許可するかは未決（OQ-05、期限は M4）であり、ここで `enabled: true` にすると決定を先取りすることになる
  // （サニタイザ側も `markdown/sanitize.ts` で disabled を要求している）。
  md.use(taskLists);

  // 最後に登録する。上のプラグインが登録したレンダラごと包む必要がある。
  md.use(lineMapPlugin);

  return md;
}

/** 構築済みのインスタンスを使い回す。構築コストは 1 回だけになる。 */
export function getMarkdownIt(): MarkdownIt {
  cached ??= createMarkdownIt();
  return cached;
}

/**
 * 見出しのスラッグ化。GitHub と揃える（Familiar）。
 *
 * 日本語の見出しがそのまま残るのは意図した挙動である。
 * GitHub も同じ挙動であり、`#見出し` のアンカーリンクが機能する。
 */
export function slugifyHeading(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[\s　]+/g, '-')
    .replace(/[!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~]/g, '');
}

/**
 * パースして HTML を作る。
 *
 * Front Matter を切り離したうえで、`data-line` が元テキストの行番号を指すよう env でオフセットを渡す。
 */
export function render(text: string): RenderResult {
  const md = getMarkdownIt();
  const { frontMatter, body, bodyStartLine } = splitFrontMatter(text);

  const env: Record<string, unknown> = {};
  const tokens = md.parse(body, env);

  if (bodyStartLine > 0) shiftTokenLines(tokens, bodyStartLine);

  const html = md.renderer.render(tokens, md.options, env);

  return {
    html,
    outline: extractOutline(tokens),
    frontMatter,
    blockCount: tokens.filter((t: Token) => t.level === 0 && t.nesting >= 0).length,
  };
}

/** Front Matter のぶんだけ行番号をずらす。 */
function shiftTokenLines(tokens: Token[], offset: number): void {
  for (const token of tokens) {
    if (token.map) token.map = [token.map[0] + offset, token.map[1] + offset];
    if (token.children) shiftTokenLines(token.children, offset);
  }
}

/**
 * 段階的描画（N-PERF-04 / 02.architecture/06-markdown-rendering-pipeline.md §4）のためにチャンク分割する。
 *
 * トップレベルのブロック境界でのみ切る。要素の途中で切ると HTML が壊れる。
 * 最初のチャンクだけを同期的に DOM へ入れ、残りは `requestIdleCallback` で足す。
 */
export function renderChunks(
  text: string,
  firstChunkBlocks: number,
  chunkBlocks: number,
): {
  chunks: string[];
  outline: OutlineItem[];
  frontMatter: string | null;
} {
  const md = getMarkdownIt();
  const { frontMatter, body, bodyStartLine } = splitFrontMatter(text);

  const env: Record<string, unknown> = {};
  const tokens = md.parse(body, env);
  if (bodyStartLine > 0) shiftTokenLines(tokens, bodyStartLine);

  const chunks: string[] = [];
  let start = 0;
  let blocks = 0;
  let limit = firstChunkBlocks;

  // 脚注ブロック（`markdown-it-footnote` が末尾に追加する）より手前でしか分割しない。
  //
  // `footnote_anchor`（戻りリンク）は level 0 / nesting 0 であり、下の判定ではトップレベルブロックの終端に該当する。
  // 実際には `<li>` の内側にあるため、ここで分割すると `<section class="footnotes">` が閉じないまま次のチャンクへ渡る。
  // 脚注ブロックは本文の末尾にしか出力されないため、まとめて最後のチャンクへ含める。
  const footnoteBlock = tokens.findIndex((t) => t.type === 'footnote_block_open');
  const cutEnd = footnoteBlock === -1 ? tokens.length : footnoteBlock;

  for (let i = 0; i < cutEnd; i++) {
    const token = tokens[i];
    if (!token) continue;
    // level 0 かつ nesting が閉じた位置がトップレベルブロックの終端になる
    if (token.level === 0 && token.nesting <= 0) {
      blocks++;
      if (blocks >= limit) {
        chunks.push(md.renderer.render(tokens.slice(start, i + 1), md.options, env));
        start = i + 1;
        blocks = 0;
        limit = chunkBlocks;
      }
    }
  }

  if (start < tokens.length) {
    chunks.push(md.renderer.render(tokens.slice(start), md.options, env));
  }

  return { chunks, outline: extractOutline(tokens), frontMatter };
}
