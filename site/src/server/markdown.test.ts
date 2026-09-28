import { describe, expect, it } from 'vitest';

import { highlightSource, splitHighlightedLines } from './markdown';

describe('highlightSource', () => {
  it('語の途中の `_` を強調として扱わない', () => {
    const [line] = highlightSource('遅延を $t_m$ とすると');
    expect(line).not.toContain('hljs-emphasis');
  });

  it('強調は行の外へ続かない', () => {
    const lines = highlightSource('*斜体*\n次の行');
    expect(lines[1]).toBe('次の行');
  });

  it('フェンスの中は言語に応じて色を付ける', () => {
    const lines = highlightSource('```ts\nconst a = 1;\n```');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('hljs-keyword');
  });

  it('入力の HTML はエスケープする', () => {
    expect(highlightSource('a < b & c').join('')).toBe('a &lt; b &amp; c');
  });
});

describe('splitHighlightedLines', () => {
  it('行をまたぐ span を行ごとに閉じて開き直す', () => {
    expect(splitHighlightedLines('<span class="x">a\nb</span>')).toEqual([
      '<span class="x">a</span>',
      '<span class="x">b</span>',
    ]);
  });
});
