/**
 * markdown-it の構築（02.architecture/06-markdown-rendering-pipeline.md §1 / ADR-0003）。
 *
 * このモジュールは **Worker 側で評価される**ことを前提にしている。
 * DOM に触れてはいけない（DOMPurify はメインスレッド側の担当）。
 *
 * # プラグイン構成の方針
 *
 * 04.tech-stack/04-markdown.md §2 が「既定で有効」とするものを入れている。
 * 目次（F-VIEW-15）だけは採用パッケージが未定なので OQ-27 に残してある。
 *
 * 脚注 / タスクリスト / GitHub Alerts は元々 M4 の担当だったが、
 * **OQ-27 の決着により M2 の着手時点へ前倒した**（06.roadmap/m2-editor.md §1.4）。
 * Design Brief §5.3 の目安「GitHub のプレビューで表示できるものは、Marxdown でも
 * 表示できる」に届いていないことが、読む体験（価値 2 位 / ADR-0008）を
 * 最も直接に損なっていたため。Mermaid（OQ-27 の案 C）は OQ-18 待ちで M3 以降。
 *
 * # `use` の順序が仕様である
 *
 * `lineMapPlugin` を**最後**に置く。あれは `md.renderer.rules[...]` を
 * その時点の中身ごと包むので、先に置くと後続プラグインの代入で上書きされる
 * （`plugins/line-map.ts`）。GitHub Alerts の `alert_open` がまさにそれに当たる。
 */
import MarkdownItCallable, { type MarkdownIt, type Token } from 'markdown-it';
import anchor from 'markdown-it-anchor';
import footnote from 'markdown-it-footnote';
import githubAlerts from 'markdown-it-github-alerts';
import taskLists from 'markdown-it-task-lists';

import { splitFrontMatter } from './plugins/front-matter';
import { extractOutline, lineMapPlugin, type OutlineItem } from './plugins/line-map';

export interface RenderResult {
  html: string;
  outline: OutlineItem[];
  frontMatter: string | null;
  /** トップレベルブロックの数。段階的描画のチャンク分割に使う。 */
  blockCount: number;
}

let cached: MarkdownIt | null = null;

export function createMarkdownIt(): MarkdownIt {
  const md = new MarkdownItCallable({
    // 02.architecture/09-security.md §1 Layer 2: html は通すが、出力は必ず Layer 3 (DOMPurify) を通す。
    // ここで false にすると、生 HTML を書いた正当なドキュメントが壊れる。
    html: true,
    linkify: true, // GFM の自動リンク
    breaks: false, // CommonMark 準拠。改行を <br> にしない
    typographer: false, // 勝手な記号変換はしない（Markdown Is the Product）
  });

  // 見出しに id を振るだけ。permalink（¶ リンク）は付けない。
  // 本文に無い記号を勝手に足すのは Principle 2「Markdown Is the Product」に反する。
  md.use(anchor, { slugify: slugifyHeading });

  // GitHub Alerts（F-VIEW-14）。`> [!NOTE]` の blockquote を `alert_open` に書き換える。
  // タイトルは GitHub と同じ英語のまま（Familiar）。ここは UI 文言ではなく
  // **本文の一部として GitHub が描くもの**なので、i18n/ja.ts の対象にしない。
  md.use(githubAlerts);

  // 脚注（F-VIEW-16）。生成されるブロックは本文の末尾に付く。
  // **チャンク分割はこのブロックの中で切ってはいけない**（`renderChunks`）。
  md.use(footnote);

  // タスクリスト（F-VIEW-01 の GFM 相当）。`<input type="checkbox" disabled>` を出す。
  // **既定のまま disabled で出す。** プレビュー上でチェックを許すか（OQ-05）は
  // 未決着で、期限は M4。ここで `enabled: true` にすると、その決定を
  // 先取りしたことになる（サニタイザ側も `markdown/sanitize.ts` で disabled を要求する）。
  md.use(taskLists);

  // **最後に置く。** 上のプラグインが登録したレンダラごと包む必要がある。
  md.use(lineMapPlugin);

  return md;
}

/** Worker のライフサイクル内で使い回す。構築コストは 1 回だけ払う。 */
export function getMarkdownIt(): MarkdownIt {
  cached ??= createMarkdownIt();
  return cached;
}

/**
 * 見出しのスラッグ化。GitHub と揃える（Familiar）。
 *
 * 日本語の見出しがそのまま残るのは意図的。GitHub も同じ挙動で、
 * `#見出し` のアンカーリンクが通る。
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
 * Front Matter を切り離したうえで、`data-line` が**元テキストの行番号**を
 * 指すように env でオフセットを渡す。
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

  // 脚注ブロック（`markdown-it-footnote` が末尾に足す）より手前でしか切らない。
  //
  // `footnote_anchor`（↩ の戻りリンク）は **level 0 / nesting 0** で、下の判定からは
  // 「トップレベルブロックの終端」に見える。実際には `<li>` の中に居るので、
  // ここで切ると `<section class="footnotes">` が閉じないまま次のチャンクへ渡る。
  // 脚注ブロックは本文の末尾にしか出ないため、丸ごと最後のチャンクへ送れば足りる。
  const footnoteBlock = tokens.findIndex((t) => t.type === 'footnote_block_open');
  const cutEnd = footnoteBlock === -1 ? tokens.length : footnoteBlock;

  for (let i = 0; i < cutEnd; i++) {
    const token = tokens[i];
    if (!token) continue;
    // level 0 かつ nesting が閉じたところがトップレベルブロックの終端
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
