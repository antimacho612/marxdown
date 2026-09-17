import { describe, expect, it } from 'vitest';

import { render } from '../pipeline';

describe('表（F-VIEW-01 / plugins/table.ts）', () => {
  it('表を .mx-table で包む', () => {
    const { html } = render('| a | b |\n| --- | --- |\n| 1 | x |\n');

    expect(html).toContain('<div class="mx-table"><table');
    expect(html).toContain('</table>\n</div>');
  });

  it('data-line は包む要素ではなく表に付く（スクロール同期の基準を変えない）', () => {
    const { html } = render('| a |\n| --- |\n| 1 |\n');

    expect(html).toMatch(/<div class="mx-table"><table data-line="0">/);
  });

  /**
   * GFM の `---:` を markdown-it は `style="text-align:right"` で出力するが、
   * `markdown/sanitize.ts` が `style` を落とすため、属性へ移さないと揃えが反映されない。
   */
  it('揃えの指定を style から data-mx-align へ移す', () => {
    const { html } = render('| 左 | 中 | 右 |\n| :-- | :-: | --: |\n| a | b | c |\n');

    expect(html).not.toContain('style=');
    expect(html).toContain('data-mx-align="left"');
    expect(html).toContain('data-mx-align="center"');
    expect(html).toContain('data-mx-align="right"');
  });

  it('数値だけの列を右寄せにする', () => {
    const { html } = render('| 名前 | 件数 |\n| --- | --- |\n| a | 1,234 |\n| b | 56 |\n');

    // 見出しも本文と同じ側へ寄せる。見出しだけ左に残ると列の境界が読めない。
    expect(html).toMatch(/<th data-mx-align="right" data-mx-num="">件数<\/th>/);
    expect(html).toMatch(/<td data-mx-align="right" data-mx-num="">1,234<\/td>/);
  });

  it('数値でない値が混ざる列は右寄せにしない', () => {
    const { html } = render('| 名前 | 版 |\n| --- | --- |\n| a | 1.2.3 |\n| b | 4 |\n');

    expect(html).not.toContain('data-mx-align');
  });

  it('値が無いことを示すセルは、数値列の判定から除く', () => {
    const { html } = render('| 名前 | 件数 |\n| --- | --- |\n| a | - |\n| b | 56 |\n');

    expect(html).toContain('data-mx-num');
  });

  it('空欄と - しか無い列は数値列にしない', () => {
    const { html } = render('| 名前 | 件数 |\n| --- | --- |\n| a | - |\n| b |  |\n');

    expect(html).not.toContain('data-mx-num');
  });

  it('揃えの指定がある列は、数値列でも指定のほうを使う', () => {
    const { html } = render('| 名前 | 件数 |\n| --- | :-- |\n| a | 1 |\n| b | 2 |\n');

    expect(html).toContain('data-mx-align="left"');
    expect(html).not.toContain('data-mx-num');
  });

  it('表が 2 つあっても、それぞれ独立して判定する', () => {
    const { html } = render('| a |\n| --- |\n| 1 |\n\n| b |\n| --- |\n| x |\n');

    expect(html.match(/<div class="mx-table">/g)).toHaveLength(2);
    expect(html.match(/data-mx-num/g)).toHaveLength(2);
  });
});
