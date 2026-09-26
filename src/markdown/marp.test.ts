import { describe, expect, it } from 'vitest';

import { renderMarp as render } from './marp';
import { extractOutline, marpFrontMatter, mathPlugin } from './pipeline';
import type { MarpRender } from './protocol';

function renderMarp(text: string): MarpRender {
  return render(text, { mathPlugin, extractOutline });
}

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
