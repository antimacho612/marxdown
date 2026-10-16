/**
 * Front Matter の分離（F-VIEW-09）。
 *
 * 先頭の `---` で囲まれたブロックを本文から切り離す。
 * ここで行うのは分離と、YAML のまま見せるときの HTML の生成だけで、YAML の解釈はしない。
 * 表として見せるときの解釈は遅延チャンク（`markdown/front-matter-table.ts`）が行い、YAML パーサをクリティカルパスに載せない。
 */

/** Front Matter と本文を分離した結果。 */
export interface SplitDocument {
  /** Front Matter の生テキスト（区切り線を含まない）。無ければ null。 */
  frontMatter: string | null;
  /** Front Matter を除いた本文。 */
  body: string;
  /**
   * 本文が元のドキュメントの何行目から始まるか（0 始まり）。
   * `data-line` を元テキストの行番号に合わせるために必要。
   */
  bodyStartLine: number;
}

const FENCE = /^---[ \t]*$/;
const END_FENCE = /^(?:---|\.\.\.)[ \t]*$/;

/** Front Matter を分離する。閉じられていない `---` は Front Matter として扱わない。 */
export function splitFrontMatter(text: string): SplitDocument {
  // BOM は Rust 側で除去済みだが、web プラットフォーム経由の入力にも対応する
  const source = text.startsWith('﻿') ? text.slice(1) : text;

  const lines = source.split('\n');
  if (lines.length < 2 || !FENCE.test(lines[0] ?? '')) {
    return { frontMatter: null, body: text, bodyStartLine: 0 };
  }

  for (let i = 1; i < lines.length; i++) {
    if (END_FENCE.test(lines[i] ?? '')) {
      const frontMatter = lines.slice(1, i).join('\n');
      const bodyStartLine = i + 1;
      return {
        frontMatter,
        body: lines.slice(bodyStartLine).join('\n'),
        bodyStartLine,
      };
    }
  }

  // 閉じられていない `---` は Front Matter ではなく、水平線と本文として扱う。
  // LLM の出力が途中で切れている場合に、本文全体が失われるほうが影響が大きい。
  return { frontMatter: null, body: text, bodyStartLine: 0 };
}

/**
 * Front Matter を YAML のコードブロックとして見せる HTML（`preview.frontMatter` が `code`）。
 *
 * `language-yaml` を付けるので、本文のコードブロックと同じ経路でハイライトとコピーボタンが付く。
 */
export function frontMatterCodeHtml(source: string): string {
  return `<pre class="mx-front-matter"><code class="language-yaml">${escapeHtml(source)}</code></pre>`;
}

/** テキストを HTML の本文・属性値として埋め込める形にする。 */
export function escapeHtml(text: string): string {
  return text.replaceAll(/[&<>"]/g, (char) => HTML_ESCAPES[char] ?? char);
}

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
