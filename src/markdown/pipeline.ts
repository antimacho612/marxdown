/**
 * markdown-it の構築（02.architecture/06-markdown-rendering-pipeline.md §1 / ADR-0003）。
 *
 * この層は文字列の変換だけを行い、DOM には触れない（サニタイズは `paint.ts` が呼ぶ DOMPurify の担当 / ADR-0006）。
 * プラグイン構成は 04.tech-stack/04-markdown.md §2 の既定に従う。
 *
 * `use` の順序は仕様であり、`lineMapPlugin` を最後に置くこと。
 * `md.renderer.rules[...]` をその時点の中身ごと包むため、先に置くと後続プラグインの代入で上書きされる。
 */
import MarkdownItCallable, { type MarkdownIt, type Token } from 'markdown-it';
import anchor from 'markdown-it-anchor';
import footnote from 'markdown-it-footnote';
import githubAlerts from 'markdown-it-github-alerts';

import { splitFrontMatter } from './plugins/front-matter';
import { extractOutline, lineMapPlugin, type OutlineItem } from './plugins/line-map';
import { linkTitlePlugin } from './plugins/link-title';
import { mathPlugin } from './plugins/math';
import { mermaidPlugin } from './plugins/mermaid';
import { useSyntax } from './plugins/syntax';
import { tablePlugin } from './plugins/table';
import { taskListPlugin } from './plugins/task-list';
import { LINE_HEAD } from './protocol';

export { loadSyntax, SYNTAX_NAMES, type SyntaxName } from './plugins/syntax';

/** `render` の結果。HTML と、そこから導出した派生値をまとめて返す。 */
export interface RenderResult {
  html: string;
  outline: OutlineItem[];
  frontMatter: string | null;
  /** トップレベルブロックの数。段階的描画のチャンク分割に使う。 */
  blockCount: number;
}

/**
 * 描画に影響するユーザー設定。
 *
 * ここに入るのは「CSS では表現できない、パースの結果そのものが変わるもの」だけである。
 * 文字サイズや配色はトークン層で適用されるため、パイプラインは知らなくてよい。
 */
export interface RenderConfig {
  /** 単独の改行を `<br>` にするか（`preview.softBreak`）。 */
  breaks?: boolean;
  /**
   * 有効にする追加記法（`markdown.*` / 04.tech-stack/04-markdown.md §3）。
   *
   * 実際に適用されるのは `loadSyntax` で読み込み済みのものだけである。読み込みは呼び出し側（`markdown/parser.ts`）が描画の前に待つ。
   */
  syntax?: readonly string[];
}

let cached: MarkdownIt | null = null;
let cachedKey: string | null = null;

/** キャッシュの一致判定。設定が変われば作り直す。 */
function configKey(config: RenderConfig): string {
  return `${String(config.breaks ?? false)}|${(config.syntax ?? []).toSorted().join(',')}`;
}

/**
 * markdown-it を組み立てる。`use` の順序は仕様である（モジュール冒頭を参照）。
 *
 * `breaks` はユーザー設定 `preview.softBreak`。既定は CommonMark 準拠の false で、単独の改行を `<br>` にしない。
 * 日本語文書では改行がそのまま反映されるほうを好む場合があるため選べるようにしてある。
 */
export function createMarkdownIt(config: RenderConfig = {}): MarkdownIt {
  const md = new MarkdownItCallable({
    // 02.architecture/09-security.md §1 Layer 2: html は通すが、出力は必ず Layer 3 (DOMPurify) を通す。
    // ここで false にすると、生 HTML を書いた正当なドキュメントが壊れる。
    html: true,
    linkify: true, // GFM の自動リンク
    breaks: config.breaks ?? false,
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

  // タスクリスト（F-VIEW-01 の GFM 相当）。`<input>` ではなく `role="checkbox"` の `<span>` を出す。
  // 自作である理由は `plugins/task-list.ts` の冒頭にある。
  md.use(taskListPlugin);

  // 数式（F-VIEW-13）。ここではプレースホルダを出すだけで、KaTeX は `features/preview/lazy/math.ts` が遅延ロードする。
  // パーサ側のプラグインを載せるほどの残余が critical path に無い（04.tech-stack/04-markdown.md §4）。
  md.use(mathPlugin);

  // Mermaid（F-VIEW-12）。`mermaid` フェンスの型を差し替えてプレースホルダにするだけで、描画は遅延チャンクが行う。
  // Mermaid は全依存の中で突出して重い（04.tech-stack/04-markdown.md §4）。
  md.use(mermaidPlugin);

  // 表（F-VIEW-01）。包む要素と揃えの属性を足すだけで、表の解釈そのものは変えない。
  // `multilineTables`（追加記法）が差し替えるのはブロックルールであり、ここが見るトークンの形は変わらない。
  md.use(tablePlugin);

  // リンクのホバー時に行き先を表示する。オートリンク・linkify は対象外（`plugins/link-title.ts`）。
  md.use(linkTitlePlugin);

  // 設定で有効化された追加記法（`markdown.*`）。既定では 1 つも入らない。
  // 標準の記法より後に置く。定義リストや上付き下付きが、既定の記法の解釈を変えないようにするためである。
  useSyntax(md, config.syntax ?? []);

  // 最後に登録する。上のプラグインが登録したレンダラごと包む必要がある。
  md.use(lineMapPlugin);

  return md;
}

/**
 * 構築済みのインスタンスを使い回す。構築コストは 1 回だけになる。
 *
 * `breaks` が前回と違えば作り直す。設定変更は頻繁ではないため、キャッシュより設定値を優先する。
 */
export function getMarkdownIt(config: RenderConfig = {}): MarkdownIt {
  const key = configKey(config);
  if (cached === null || cachedKey !== key) {
    cached = createMarkdownIt(config);
    cachedKey = key;
  }
  return cached;
}

/**
 * キャッシュを破棄する。
 *
 * 追加記法は非同期に読み込まれるため、読み込みが済んだ時点で組み立て直す必要がある。
 * 設定キーが同じでも、`useSyntax` が返すものが変わっているためキャッシュは使えない。
 */
export function resetMarkdownIt(): void {
  cached = null;
  cachedKey = null;
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
export function render(text: string, config: RenderConfig = {}): RenderResult {
  const md = getMarkdownIt(config);
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
 *
 * `blocks` は Split の再描画で差分を取るための単位で、連結すると `chunks` の連結と一致する。
 * `data-line` を持つ要素で始まらないブロック（生の HTML・脚注）は直前のブロックに連結する。
 * DOM 側で境界を `data-line` から復元できるようにするためである。
 */
export function renderChunks(
  text: string,
  firstChunkBlocks: number,
  chunkBlocks: number,
  config: RenderConfig = {},
): {
  chunks: string[];
  blocks: string[];
  outline: OutlineItem[];
  frontMatter: string | null;
} {
  const md = getMarkdownIt(config);
  const { frontMatter, body, bodyStartLine } = splitFrontMatter(text);

  const env: Record<string, unknown> = {};
  const tokens = md.parse(body, env);
  if (bodyStartLine > 0) shiftTokenLines(tokens, bodyStartLine);

  const chunks: string[] = [];
  const blocks: string[] = [];
  /** 現在のチャンクに入るブロックの HTML。チャンクの区切りと `blocks` の区切りは一致しないため、別に持つ。 */
  let pending: string[] = [];
  let start = 0;
  let count = 0;
  let limit = firstChunkBlocks;

  const pushBlock = (end: number): void => {
    const html = md.renderer.render(tokens.slice(start, end), md.options, env);
    start = end;
    pending.push(html);
    const last = blocks.length - 1;
    if (last >= 0 && !LINE_HEAD.test(html)) blocks[last] += html;
    else blocks.push(html);
  };

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
      pushBlock(i + 1);
      count++;
      if (count >= limit) {
        chunks.push(pending.join(''));
        pending = [];
        count = 0;
        limit = chunkBlocks;
      }
    }
  }

  if (start < tokens.length) pushBlock(tokens.length);
  if (pending.length > 0) chunks.push(pending.join(''));

  return { chunks, blocks, outline: extractOutline(tokens), frontMatter };
}
