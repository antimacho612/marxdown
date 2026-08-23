/**
 * markdown-it の構築（02.architecture.md §6.1 / ADR-0003）。
 *
 * このモジュールは **Worker 側で評価される**ことを前提にしている。
 * DOM に触れてはいけない（DOMPurify はメインスレッド側の担当）。
 *
 * # プラグイン構成の方針
 *
 * 04.tech-stack.md §4.2 が「既定で有効」とするもののうち、
 * M1 のスコープ（CommonMark + GFM）に必要なものだけを入れている。
 * 脚注 / タスクリスト / GitHub Alerts は M4 の担当（06.roadmap.md §7.1）で、
 * 先に入れるとクリティカルパスの予算を M1 の実測から見えなくしてしまう。
 */
import MarkdownItCallable, { type MarkdownIt, type Token } from 'markdown-it'
import anchor from 'markdown-it-anchor'

import { splitFrontMatter } from './plugins/front-matter'
import { extractOutline, lineMapPlugin, type OutlineItem } from './plugins/line-map'

export interface RenderResult {
  html: string
  outline: OutlineItem[]
  frontMatter: string | null
  /** トップレベルブロックの数。段階的描画のチャンク分割に使う。 */
  blockCount: number
}

let cached: MarkdownIt | null = null

export function createMarkdownIt(): MarkdownIt {
  const md = new MarkdownItCallable({
    // 02.architecture.md §9.1 Layer 2: html は通すが、出力は必ず Layer 3 (DOMPurify) を通す。
    // ここで false にすると、生 HTML を書いた正当なドキュメントが壊れる。
    html: true,
    linkify: true, // GFM の自動リンク
    breaks: false, // CommonMark 準拠。改行を <br> にしない
    typographer: false, // 勝手な記号変換はしない（Markdown Is the Product）
  })

  md.use(lineMapPlugin)
  // 見出しに id を振るだけ。permalink（¶ リンク）は付けない。
  // 本文に無い記号を勝手に足すのは Principle 2「Markdown Is the Product」に反する。
  md.use(anchor, { slugify: slugifyHeading })

  return md
}

/** Worker のライフサイクル内で使い回す。構築コストは 1 回だけ払う。 */
export function getMarkdownIt(): MarkdownIt {
  cached ??= createMarkdownIt()
  return cached
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
    .replace(/[!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~]/g, '')
}

/**
 * パースして HTML を作る。
 *
 * Front Matter を切り離したうえで、`data-line` が**元テキストの行番号**を
 * 指すように env でオフセットを渡す。
 */
export function render(text: string): RenderResult {
  const md = getMarkdownIt()
  const { frontMatter, body, bodyStartLine } = splitFrontMatter(text)

  const env: Record<string, unknown> = {}
  const tokens = md.parse(body, env)

  if (bodyStartLine > 0) shiftTokenLines(tokens, bodyStartLine)

  const html = md.renderer.render(tokens, md.options, env)

  return {
    html,
    outline: extractOutline(tokens),
    frontMatter,
    blockCount: tokens.filter((t: Token) => t.level === 0 && t.nesting >= 0).length,
  }
}

/** Front Matter のぶんだけ行番号をずらす。 */
function shiftTokenLines(tokens: Token[], offset: number): void {
  for (const token of tokens) {
    if (token.map) token.map = [token.map[0] + offset, token.map[1] + offset]
    if (token.children) shiftTokenLines(token.children, offset)
  }
}

/**
 * 段階的描画（N-PERF-04 / 02.architecture.md §6.4）のためにチャンク分割する。
 *
 * トップレベルのブロック境界でのみ切る。要素の途中で切ると HTML が壊れる。
 * 最初のチャンクだけを同期的に DOM へ入れ、残りは `requestIdleCallback` で足す。
 */
export function renderChunks(
  text: string,
  firstChunkBlocks: number,
  chunkBlocks: number,
): {
  chunks: string[]
  outline: OutlineItem[]
  frontMatter: string | null
} {
  const md = getMarkdownIt()
  const { frontMatter, body, bodyStartLine } = splitFrontMatter(text)

  const env: Record<string, unknown> = {}
  const tokens = md.parse(body, env)
  if (bodyStartLine > 0) shiftTokenLines(tokens, bodyStartLine)

  const chunks: string[] = []
  let start = 0
  let blocks = 0
  let limit = firstChunkBlocks

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (!token) continue
    // level 0 かつ nesting が閉じたところがトップレベルブロックの終端
    if (token.level === 0 && token.nesting <= 0) {
      blocks++
      if (blocks >= limit) {
        chunks.push(md.renderer.render(tokens.slice(start, i + 1), md.options, env))
        start = i + 1
        blocks = 0
        limit = chunkBlocks
      }
    }
  }

  if (start < tokens.length) {
    chunks.push(md.renderer.render(tokens.slice(start), md.options, env))
  }

  return { chunks, outline: extractOutline(tokens), frontMatter }
}
