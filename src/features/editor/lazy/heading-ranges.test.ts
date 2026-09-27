/**
 * 見出しの折りたたみ範囲。
 *
 * 見出しは実際のパイプラインから取る。
 * コードブロック内の `#` やフロントマターの扱いがアウトラインと食い違わないことが、自前で行を走査しない理由だからである（`folding.ts`）。
 */
import { describe, expect, it } from 'vitest';

import { render } from '@/markdown/pipeline';

import { headingRanges } from './heading-ranges';

/** 本文を行に分け、実際のパイプラインの見出しから範囲を作る。範囲は 1 始まりの行番号で返る。 */
function rangesOf(lines: readonly string[]): [number, number][] {
  const { outline } = render(lines.join('\n'));
  const isBlank = (line: number): boolean => (lines[line - 1] ?? '').trim() === '';
  return headingRanges(outline, lines.length, isBlank).map(({ start, end }) => [start, end]);
}

describe('headingRanges', () => {
  it('同じかそれより上の階層の次の見出しの直前までを範囲にする', () => {
    const ranges = rangesOf(['# A', 'a', '## B', 'b', '### C', 'c', '## D', 'd', '# E', 'e']);

    expect(ranges).toEqual([
      [1, 8],
      [3, 6],
      [5, 6],
      [7, 8],
      [9, 10],
    ]);
  });

  it('次の見出しとの間の空行は範囲に含めない', () => {
    expect(rangesOf(['# A', '', 'a', '', '', '# B', 'b', '', ''])).toEqual([
      [1, 3],
      [6, 7],
    ]);
  });

  it('本文の無い見出しは範囲を作らない', () => {
    expect(rangesOf(['# A', '', '# B', 'b'])).toEqual([[3, 4]]);
  });

  it('コードブロック内の # は見出しとして扱わない', () => {
    expect(rangesOf(['# A', '```sh', '# comment', '```', '# B', 'b'])).toEqual([
      [1, 4],
      [5, 6],
    ]);
  });

  it('フロントマターの行数ぶんずらさずに元の行番号で返す', () => {
    expect(rangesOf(['---', 'title: x', '---', '# A', 'a'])).toEqual([[4, 5]]);
  });

  it('本文より古い見出しで行数を超えるものは無視する', () => {
    const items = [
      { level: 1, line: 0 },
      { level: 1, line: 9 },
    ];

    expect(headingRanges(items, 3, () => false)).toEqual([{ start: 1, end: 3 }]);
  });
});
