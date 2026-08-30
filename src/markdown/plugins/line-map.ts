/**
 * すべてのブロックレベル要素に `data-line="開始行"` を付ける markdown-it プラグイン。
 *
 * 02.architecture/06-markdown-rendering-pipeline.md §3。VS Code の Markdown プレビューと同じ手法で、
 * 以下がすべてこの 1 つの仕組みの上に乗る。
 *
 * - Split モードのスクロール同期（双方向）
 * - Preview のクリック → 該当ソース行へジャンプ
 * - 編集中の該当位置をプレビュー側でハイライト
 * - アウトラインからのジャンプ
 *
 * 消費側（スクロール同期）は M2 だが、**先行投資として最初から付けておく**。
 * あとから入れると HTML の形が変わって回帰が出る。
 *
 * # プラグインより後に `use` すること
 *
 * ここは `md.renderer.rules[...]` を**その時点の中身ごと包む**。先に `use` すると
 * 包む相手がまだ居らず、後から登録したプラグインの代入で丸ごと上書きされる。
 * `pipeline.ts` が `lineMapPlugin` を最後に置いているのはこのため。
 */
import type { MarkdownIt, RendererRule, Token } from 'markdown-it';

/**
 * `data-line` を付ける対象。インライン要素には付けない（数が爆発するため）。
 *
 * これらは `renderToken` を通るので、トークンに属性を足せばそのまま出力に載る。
 */
const BLOCK_OPEN_RULES = [
  'paragraph_open',
  'heading_open',
  'blockquote_open',
  'bullet_list_open',
  'ordered_list_open',
  'list_item_open',
  'table_open',
  'hr',
  'html_block',
] as const;

/**
 * `renderToken` を通らないルールと、`data-line` を差し込む開始タグ。
 *
 * markdown-it の `fence` / `code_block` レンダラは `<pre><code ...>` を手で組み立て、
 * **トークンの属性を `<code>` 側に出す**。そのまま `attrSet` すると
 * `data-line` が `<code>` に付き、ブロック要素である `<pre>` に付かない。
 * スクロール同期は `<pre>` の位置を必要とするので、出力後に `<pre>` へ差し込む。
 *
 * `alert_open`（GitHub Alerts / F-VIEW-14）も同じ形。あちらは
 * **`blockquote_open` を書き換えて作られる**（`markdown-it-github-alerts` の core ルール）ので、
 * `BLOCK_OPEN_RULES` の `blockquote_open` は当たらない。レンダラはタイトル行と
 * アイコンを含む `<div>` を文字列で組み立て、トークンの属性を見ない。
 */
const RAW_OPEN_RULES = [
  ['fence', '<pre'],
  ['code_block', '<pre'],
  ['alert_open', '<div'],
] as const;

export function lineMapPlugin(md: MarkdownIt): void {
  for (const rule of BLOCK_OPEN_RULES) {
    const original = md.renderer.rules[rule];

    const patched: RendererRule = (tokens, idx, options, env, self) => {
      const token = tokens[idx];
      if (token?.map) {
        // token.map は [開始行, 終了行) の 0 始まり
        token.attrSet('data-line', String(token.map[0]));
      }
      return original ? original(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options);
    };
    md.renderer.rules[rule] = patched;
  }

  for (const [rule, tag] of RAW_OPEN_RULES) {
    const original = md.renderer.rules[rule];

    const patched: RendererRule = (tokens, idx, options, env, self) => {
      const html = original ? original(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options);
      const line = tokens[idx]?.map?.[0];
      if (line === undefined) return html;
      return html.replace(tag, `${tag} data-line="${line}"`);
    };
    md.renderer.rules[rule] = patched;
  }
}

/**
 * トークン列から見出しを抜き出す（アウトライン用）。
 *
 * レンダリングとは独立に呼べるようにしておく。Worker 側でパースした
 * 同じ Token[] を使い回すことで、2 回パースしなくて済む。
 */
export interface OutlineItem {
  level: number;
  text: string;
  line: number;
  slug: string;
}

export function extractOutline(tokens: Token[]): OutlineItem[] {
  const out: OutlineItem[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const open = tokens[i];
    if (open?.type !== 'heading_open') continue;
    const inline = tokens[i + 1];
    out.push({
      level: Number(open.tag.slice(1)),
      text: inline?.content ?? '',
      line: open.map?.[0] ?? 0,
      slug: String(open.attrGet('id') ?? ''),
    });
  }
  return out;
}
