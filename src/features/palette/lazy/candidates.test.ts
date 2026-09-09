/**
 * クイックオープンの候補（F-NAV-05 / M3 Phase 6）。
 *
 * 見たいのは並びと重複の扱いである。
 * 「最近開いたファイル → フォルダ内 Markdown」は 03.ux-spec/05-command-palette.md の指定であり、
 * 何も入力せずに開いたときの並びがそのまま体験になる。
 */
import { describe, expect, it } from 'vitest';

import type { RecentEntry } from '@/platform';

import { buildCandidates } from './candidates';

const RECENT_LABEL = '最近';

function recent(...paths: string[]): RecentEntry[] {
  return paths.map((path) => ({ path, openedAtMs: 0 }));
}

describe('候補の組み立て', () => {
  it('最近開いたファイルが先、続いてフォルダ内の Markdown', () => {
    const candidates = buildCandidates(
      'C:/work',
      ['C:/work/a.md', 'C:/work/docs/b.md'],
      recent('C:/other/z.md'),
      RECENT_LABEL,
    );

    expect(candidates.map((c) => c.path)).toEqual(['C:/other/z.md', 'C:/work/a.md', 'C:/work/docs/b.md']);
  });

  it('両方に現れたファイルは最近開いたファイル側だけを残す', () => {
    const candidates = buildCandidates('C:/work', ['C:/work/a.md'], recent('C:/work/a.md'), RECENT_LABEL);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.detail).toBe(RECENT_LABEL);
  });

  it('最近開いたファイルの重複も畳む', () => {
    const candidates = buildCandidates(null, [], recent('C:/work/a.md', 'C:/work/a.md'), RECENT_LABEL);

    expect(candidates).toHaveLength(1);
  });

  it('補足は基点からの相対ディレクトリ。直下なら空', () => {
    const candidates = buildCandidates('C:/work', ['C:/work/a.md', 'C:/work/docs/adr/b.md'], [], RECENT_LABEL);

    expect(candidates.map((c) => c.detail)).toEqual(['', 'docs/adr']);
  });

  it('基点の外にあるものは絶対パスのディレクトリを出す', () => {
    const candidates = buildCandidates('C:/work', ['D:/elsewhere/a.md'], [], RECENT_LABEL);

    expect(candidates[0]?.detail).toBe('D:/elsewhere');
  });

  it('照合の対象はファイル名', () => {
    const candidates = buildCandidates('C:/work', ['C:/work/docs/design.md'], [], RECENT_LABEL);

    expect(candidates[0]?.name).toBe('design.md');
  });
});
