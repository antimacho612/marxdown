/**
 * すべてのブロックレベル要素に `data-line="開始行"` を付ける markdown-it プラグイン（VS Code の Markdown プレビューと同じ手法）。
 * スクロール同期・クリックジャンプ・編集位置ハイライト・アウトラインジャンプの基盤である。
 *
 * 他のプラグインより後に `use` すること。
 * `md.renderer.rules[...]` をその時点の中身ごと包むため、先に置くと後続プラグインの代入で上書きされる（`pipeline.ts` が最後に置いている理由）。
 */
import type { MarkdownIt, RendererRule, Token } from 'markdown-it';

/**
 * `data-line` を付ける対象。インライン要素には付けない（数が膨大になるため）。
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
 * markdown-it の `fence` / `code_block` レンダラは `<pre><code ...>` を文字列で組み立て、トークンの属性を `<code>` 側に出力する。
 * そのまま `attrSet` すると `data-line` が `<code>` に付き、ブロック要素である `<pre>` には付かない。
 * スクロール同期は `<pre>` の位置を必要とするため、出力後に `<pre>` へ差し込む。
 *
 * `alert_open`（GitHub Alerts / F-VIEW-14）も同じ構造である。
 * これは `blockquote_open` を書き換えて生成される（`markdown-it-github-alerts` の core ルール）ため、`BLOCK_OPEN_RULES` の `blockquote_open` には該当しない。
 * レンダラはタイトル行とアイコンを含む `<div>` を文字列で組み立て、トークンの属性を参照しない。
 *
 * `math_block`（F-VIEW-13）と `mermaid_block`（F-VIEW-12）も自作のレンダラが `<div>` を文字列で組み立てるため同じ扱いになる。
 */
const RAW_OPEN_RULES = [
  ['fence', '<pre'],
  ['code_block', '<pre'],
  ['alert_open', '<div'],
  ['math_block', '<div'],
  ['mermaid_block', '<div'],
] as const;

/** `data-line` を付けるレンダラで既存のルールを包む。`use` は他のプラグインより後に行う。 */
export function lineMapPlugin(md: MarkdownIt): void {
  for (const rule of BLOCK_OPEN_RULES) {
    const original = md.renderer.rules[rule];

    const patched: RendererRule = (tokens, idx, options, env, self) => {
      const token = tokens[idx];
      if (token?.map) {
        // `token.map` は 0 始まりの [開始行, 終了行) である
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

/** アウトライン 1 項目（F-VIEW-02）。`line` は元テキストの行番号（0 始まり）。 */
export interface OutlineItem {
  level: number;
  text: string;
  line: number;
  slug: string;
}

/**
 * トークン列から見出しを抽出する（アウトライン用）。
 *
 * レンダリングとは独立に呼べるようにしてある。
 * パース済みの同じ `Token[]` を使い回すことで、2 回パースせずに済む。
 */
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
