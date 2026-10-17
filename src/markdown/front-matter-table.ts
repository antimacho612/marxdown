/**
 * Front Matter を表として見せる HTML を作る（F-VIEW-09 / `preview.frontMatter` が `table`）。
 *
 * js-yaml を含むため遅延チャンクに置き、Front Matter のある文書を表として描くときだけ読み込む（`markdown/parser.ts`）。
 * GitHub のように全キーを 1 行に並べる横長の表にはせず、キーと値を 1 行ずつ並べる。横長の表は本文幅に収まらず、キーと値の対応も追いにくい。
 */
import { FAILSAFE_SCHEMA, load } from 'js-yaml';

/**
 * 入れ子の深さの上限。超えたら表にせず YAML のまま見せる。
 *
 * アンカーで自分自身を参照する YAML（`&a [*a]`）は循環した値になるため、上限が無いと展開が終わらない。
 */
const MAX_DEPTH = 8;

class TooDeep extends Error {}

/**
 * Front Matter の生テキストを表の HTML にする。
 *
 * 最上位がキーを 1 つ以上持つマッピングでないとき（YAML として読めない、スカラーや配列だけ、空）は `null` を返す。
 * 呼び出し側はその場合に YAML のまま見せる。
 * 値は FAILSAFE スキーマで読み、書かれた綴りのまま表示する（`1.10` を `1.1` に、`yes` を `true` に変えない）。
 * 戻り値は文字列を埋め込む箇所をすべてエスケープ済みだが、描画側では本文と同じくサニタイズを通す。
 */
export function frontMatterTableHtml(source: string): string | null {
  let data: unknown;
  try {
    data = load(source, { schema: FAILSAFE_SCHEMA });
  } catch {
    return null;
  }
  if (!isMapping(data) || Object.keys(data).length === 0) return null;

  try {
    return `<div class="mx-front-matter" data-mx-front-matter="table">${mapping(data, 0)}</div>`;
  } catch (e) {
    if (e instanceof TooDeep) return null;
    throw e;
  }
}

function isMapping(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mapping(data: Record<string, unknown>, depth: number): string {
  const entries = Object.entries(data);
  if (entries.length === 0) return '<span class="mx-front-matter-empty">{}</span>';
  const rows = entries.map(
    ([key, value]) => `<tr><th scope="row">${escapeHtml(key)}</th><td>${node(value, depth)}</td></tr>`,
  );
  return `<table><tbody>${rows.join('')}</tbody></table>`;
}

/**
 * 配列。1 行に収まる文字列だけの配列（`tags: [a, b]`）はタグとして横に並べる。
 * それ以外は項目ごとに縦に並べる。
 */
function list(items: unknown[], depth: number): string {
  if (items.length === 0) return '<span class="mx-front-matter-empty">[]</span>';
  if (items.every((item) => typeof item === 'string' && item !== '' && !item.includes('\n'))) {
    return `<ul class="mx-front-matter-tags">${items.map((item) => `<li>${escapeHtml(item as string)}</li>`).join('')}</ul>`;
  }
  return `<ul class="mx-front-matter-list">${items.map((item) => `<li>${node(item, depth)}</li>`).join('')}</ul>`;
}

function node(value: unknown, depth: number): string {
  // ブロックスカラー（`|`）の末尾の改行は、表の中では余白にしかならない。
  if (typeof value === 'string') return escapeHtml(value.replace(/\n$/, ''));
  // FAILSAFE スキーマでは値は文字列・配列・マッピングだけになる。null は値の無いキー（`key:`）である。
  if (value === null || value === undefined) return '';
  if (depth + 1 > MAX_DEPTH) throw new TooDeep();
  if (Array.isArray(value)) return list(value, depth + 1);
  if (isMapping(value)) return mapping(value, depth + 1);
  return escapeHtml(String(value));
}

/**
 * NOTE: `plugins/front-matter.ts` の `escapeHtml` と同じ処理である。
 * import すると、そのモジュールが pipeline と共有され `shared-*`（critical path）へ切り出される。
 */
function escapeHtml(text: string): string {
  return text.replaceAll(/[&<>"]/g, (char) => HTML_ESCAPES[char] ?? char);
}

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
