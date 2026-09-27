import { describe, expect, it } from 'vitest';

import { markdownLink, relativeTo, relativeToRoot } from './link';

describe('relativeTo', () => {
  it('同じフォルダと子孫', () => {
    expect(relativeTo('C:\\w\\docs', 'C:\\w\\docs\\a.md')).toBe('a.md');
    expect(relativeTo('C:\\w', 'C:\\w\\docs\\img\\a.png')).toBe('docs/img/a.png');
  });

  it('祖先を経由する', () => {
    expect(relativeTo('C:\\w\\docs\\x', 'C:\\w\\notes\\a.md')).toBe('../../notes/a.md');
    expect(relativeTo('/w/docs', '/w/a.md')).toBe('../a.md');
  });

  it('Windows のパスは大文字と小文字を区別しない', () => {
    expect(relativeTo('c:\\W\\Docs', 'C:\\w\\docs\\a.md')).toBe('a.md');
  });

  it('ドライブが違えば絶対パスのまま返す', () => {
    expect(relativeTo('C:\\w', 'D:\\x\\a.md')).toBe('D:/x/a.md');
  });
});

describe('relativeToRoot', () => {
  it('基点からの相対パスを OS の区切りのまま返す', () => {
    expect(relativeToRoot('C:\\w\\docs\\a.md', 'C:\\w')).toBe('docs\\a.md');
    expect(relativeToRoot('C:\\w', 'C:\\w')).toBe('.');
  });
});

describe('markdownLink', () => {
  it('Markdown は拡張子を除いた名前をリンクの文字にする', () => {
    expect(markdownLink('C:\\w\\docs\\guide.md', 'C:\\w')).toBe('[guide](docs/guide.md)');
  });

  it('画像は画像の記法にする', () => {
    expect(markdownLink('C:\\w\\img\\fig 1.png', 'C:\\w\\docs')).toBe('![fig 1](<../img/fig 1.png>)');
  });

  it('角括弧はエスケープする', () => {
    expect(markdownLink('/w/[draft].txt', '/w')).toBe('[\\[draft\\].txt]([draft].txt)');
  });
});
