import { describe, expect, it } from 'vitest';

import type { OutlineItem } from '@/markdown/plugins/line-map';

import { fuzzyFilter, fuzzyScore } from './fuzzy';

const HEADINGS: OutlineItem[] = [
  '起動シーケンス',
  'コールド起動',
  'ウォーム起動（単一インスタンス）',
  'Markdown パイプライン',
].map((text, line) => ({ level: 2, text, line, slug: `h${line}` }));

function texts(items: readonly OutlineItem[]): string[] {
  return items.map((item) => item.text);
}

describe('見出しのあいまい検索 (Ctrl+Shift+O)', () => {
  it('順番に含まれていれば一致する', () => {
    expect(fuzzyScore('起動シーケンス', '起動')).not.toBeNull();
    expect(fuzzyScore('起動シーケンス', 'きどう')).toBeNull();
    expect(fuzzyScore('Markdown パイプライン', 'mdpipe')).toBeNull();
    expect(fuzzyScore('Markdown パイプライン', 'mark')).not.toBeNull();
  });

  it('大文字小文字を区別しない', () => {
    expect(fuzzyScore('Markdown パイプライン', 'MARKDOWN')).not.toBeNull();
  });

  it('連続して当たったほうが上に来る', () => {
    expect(fuzzyFilter(HEADINGS, '起動')[0]?.text).toBe('起動シーケンス');
  });

  it('空のクエリでは全件が文書順のまま返る（開いた直後はアウトラインに見える）', () => {
    expect(texts(fuzzyFilter(HEADINGS, ''))).toEqual(texts(HEADINGS));
  });

  it('一致しなければ 0 件', () => {
    expect(fuzzyFilter(HEADINGS, 'zzz')).toHaveLength(0);
  });

  it('空白は区切りとして無視する', () => {
    expect(fuzzyScore('ウォーム起動（単一インスタンス）', 'ウォーム 単一')).not.toBeNull();
  });
});
