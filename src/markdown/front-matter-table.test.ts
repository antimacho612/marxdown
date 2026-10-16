import { describe, expect, it } from 'vitest';

import { frontMatterTableHtml } from './front-matter-table';
import { createParser } from './parser';

/** HTML を DOM にせずに、行（`<tr>`）ごとのキーと値の組へ戻す。最上位の表だけを見る。 */
function rows(html: string | null): string[] {
  expect(html).not.toBeNull();
  return Array.from((html ?? '').matchAll(/<tr><th scope="row">(.*?)<\/th><td>/g), (match) => match[1] ?? '');
}

describe('frontMatterTableHtml (F-VIEW-09)', () => {
  it('キーを書かれた順に 1 行ずつ並べる', () => {
    expect(rows(frontMatterTableHtml('title: 設計メモ\ndate: 2026-10-16\ndraft: false'))).toEqual([
      'title',
      'date',
      'draft',
    ]);
  });

  it('値は書かれた綴りのまま表示する', () => {
    const html = frontMatterTableHtml('version: 1.10\nflag: yes\ndate: 2026-10-16\nnothing: ~');
    expect(html).toContain('<td>1.10</td>');
    expect(html).toContain('<td>yes</td>');
    expect(html).toContain('<td>2026-10-16</td>');
    expect(html).toContain('<td>~</td>');
  });

  it('文字列だけの配列はタグとして並べる', () => {
    expect(frontMatterTableHtml('tags: [cache, api]')).toContain(
      '<ul class="mx-front-matter-tags"><li>cache</li><li>api</li></ul>',
    );
  });

  it('入れ子のマッピングは表の中の表にする', () => {
    const html = frontMatterTableHtml('author:\n  name: A\n  url: https://example.com');
    expect(html).toContain('<td><table><tbody><tr><th scope="row">name</th><td>A</td></tr>');
  });

  it('マッピングを含む配列は項目ごとに縦に並べる', () => {
    const html = frontMatterTableHtml('items:\n  - a: 1\n  - plain');
    expect(html).toContain('<ul class="mx-front-matter-list"><li><table>');
    expect(html).toContain('<li>plain</li></ul>');
  });

  it('値の無いキーと空の配列・マッピングも行として残す', () => {
    const html = frontMatterTableHtml('empty:\nlist: []\nmap: {}');
    expect(rows(html)).toEqual(['empty', 'list', 'map']);
    expect(html).toContain('<span class="mx-front-matter-empty">[]</span>');
    expect(html).toContain('<span class="mx-front-matter-empty">{}</span>');
  });

  it('ブロックスカラーの末尾の改行を落とす', () => {
    expect(frontMatterTableHtml('desc: |\n  line1\n  line2\n')).toContain('<td>line1\nline2</td>');
  });

  it('キーと値をエスケープする', () => {
    const html = frontMatterTableHtml('"<b>": "<script>alert(1)</script>"');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>');
    expect(html).toContain('&lt;script&gt;');
  });

  it.each([
    ['YAML として読めない', 'title: [unclosed'],
    ['キーが重複している', 'a: 1\na: 2'],
    ['最上位がスカラー', 'just a string'],
    ['最上位が配列', '- a\n- b'],
    ['空', ''],
    ['自分自身を参照している', 'self: &a [x, *a]'],
  ])('%s場合は null を返す', (_, source) => {
    expect(frontMatterTableHtml(source)).toBeNull();
  });
});

describe('パース結果の Front Matter の HTML (preview.frontMatter)', () => {
  const text = '---\ntitle: x\n---\n\n# 本文\n';

  it('既定では表にする', async () => {
    const result = await createParser().parse(text);
    expect(result.frontMatter).toBe('title: x');
    expect(result.frontMatterHtml).toContain('data-mx-front-matter="table"');
  });

  it('code では YAML のコードブロックにする', async () => {
    const result = await createParser().parse(text, { frontMatter: 'code' });
    expect(result.frontMatterHtml).toBe(
      '<pre class="mx-front-matter"><code class="language-yaml">title: x</code></pre>',
    );
  });

  it('hidden では入れない', async () => {
    const result = await createParser().parse(text, { frontMatter: 'hidden' });
    expect(result.frontMatter).toBe('title: x');
    expect(result.frontMatterHtml).toBeNull();
  });

  it('表にできない内容は YAML のまま見せる', async () => {
    const result = await createParser().parse('---\njust text\n---\n\n# 本文\n', { frontMatter: 'table' });
    expect(result.frontMatterHtml).toContain('language-yaml');
  });

  it('Front Matter が無ければ null', async () => {
    const result = await createParser().parse('# 本文\n');
    expect(result.frontMatterHtml).toBeNull();
  });
});
