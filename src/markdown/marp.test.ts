import { describe, expect, it } from 'vitest';

import { renderMarp as render } from './marp';
import { extractOutline, marpFrontMatter, mathPlugin } from './pipeline';
import type { MarpRender, MarpThemeSet } from './protocol';

const NO_THEMES: MarpThemeSet = { themes: [], problems: [] };

function renderMarp(text: string, themes = NO_THEMES): MarpRender {
  return render(text, { mathPlugin, extractOutline }, themes);
}

describe('自作テーマ', () => {
  const deck = (theme: string): string => `---\nmarp: true\ntheme: ${theme}\n---\n\n# a\n`;

  it('@theme の名前で登録し、文書の theme: から選べる', () => {
    const themes: MarpThemeSet = {
      themes: [{ path: 'C:/t/mine.css', css: '/* @theme mine */\nsection { background: #123456; }' }],
      problems: [],
    };
    const { css, themeProblems } = renderMarp(deck('mine'), themes);
    expect(css).toContain('#123456');
    expect(themeProblems).toEqual([]);
  });

  it('@theme の無いものと、読めなかったものを返す', () => {
    const themes: MarpThemeSet = {
      themes: [{ path: 'C:/t/nameless.css', css: 'section { color: red; }' }],
      problems: [{ path: 'C:/t/missing.css', kind: 'missing' }],
    };
    expect(renderMarp(deck('default'), themes).themeProblems).toEqual([
      { path: 'C:/t/missing.css', kind: 'missing' },
      { path: 'C:/t/nameless.css', kind: 'no-theme-name' },
    ]);
  });

  it('同じ読み込み結果では登録し直さず、問題も繰り返し返さない', () => {
    const themes: MarpThemeSet = { themes: [], problems: [{ path: 'C:/t/a.css', kind: 'missing' }] };
    expect(renderMarp(deck('default'), themes).themeProblems).toHaveLength(1);
    expect(renderMarp(deck('default'), themes).themeProblems).toBeUndefined();
  });

  it('組み込みの名前を上書きしたテーマは、外すと元に戻る', () => {
    const override: MarpThemeSet = {
      themes: [{ path: 'C:/t/default.css', css: '/* @theme default */\nsection { background: #abcdef; }' }],
      problems: [],
    };
    expect(renderMarp(deck('default'), override).css).toContain('#abcdef');
    expect(renderMarp(deck('default'), { themes: [], problems: [] }).css).not.toContain('#abcdef');
  });
});

describe('marpFrontMatter', () => {
  const marp = (frontMatter: string): boolean => marpFrontMatter(`---\n${frontMatter}\n---\n\n# a\n`) !== null;

  it('最上位の marp: true だけを Marp の文書とみなす', () => {
    expect(marp('marp: true')).toBe(true);
    expect(marp('title: a\nmarp: true # スライド')).toBe(true);
    expect(marp('marp: false')).toBe(false);
    expect(marp('  marp: true')).toBe(false);
    expect(marp('notmarp: true')).toBe(false);
  });

  it('Front Matter で始まらない文書は対象にしない', () => {
    expect(marpFrontMatter('# a\n\n---\nmarp: true\n---\n')).toBeNull();
    expect(marpFrontMatter('\u{FEFF}---\nmarp: true\n---\n')).toBe('marp: true');
  });
});

describe('renderMarp', () => {
  const deck = '---\nmarp: true\n---\n\n# 1 枚目\n\n---\n\n## 2 枚目\n\n$x^2$\n';

  it('スライドごとに SVG 1 つを返す', () => {
    const { slides } = renderMarp(deck);
    expect(slides).toHaveLength(2);
    for (const slide of slides) expect(slide).toMatch(/^<svg data-marpit-svg=""/);
  });

  it('スライドの開始行を data-line に付ける', () => {
    const { slides } = renderMarp(deck);
    expect(slides[0]).toContain('data-line="0"');
    expect(slides[1]).toContain('data-line="6"');
  });

  it('スライドの中の見出しと段落にも開始行を付ける', () => {
    const { slides } = renderMarp(deck);
    expect(slides[0]).toMatch(/<h1[^>]*data-line="4"/);
    expect(slides[1]).toMatch(/<p[^>]*data-line="10"/);
  });

  it('見出しをアウトラインとして返す', () => {
    const { outline } = renderMarp(deck);
    expect(outline.map((item) => [item.level, item.text, item.line])).toEqual([
      [1, '1 枚目', 4],
      [2, '2 枚目', 8],
    ]);
  });

  it('数式はプレースホルダにする', () => {
    expect(renderMarp(deck).slides[1]).toContain('class="mx-math"');
  });

  it('ブラウザ用のスクリプトと twemoji の画像を出力しない', () => {
    const { slides } = renderMarp('---\nmarp: true\n---\n\n😀 :smile:\n');
    expect(slides[0]).not.toContain('<script');
    expect(slides[0]).not.toContain('twemoji');
  });
});
