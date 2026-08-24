import { describe, expect, it } from 'vitest';

import { dirOf, isAbsolutePath, isMarkdownPath, joinPath, splitPath } from './path';

describe('splitPath', () => {
  it('Windows のパスを割る', () => {
    expect(splitPath('C:\\work\\docs\\a.md')).toEqual({ dir: 'C:\\work\\docs', name: 'a.md' });
  });

  it('POSIX のパスを割る', () => {
    expect(splitPath('/home/me/a.md')).toEqual({ dir: '/home/me', name: 'a.md' });
  });

  it('区切りが無ければ全体がファイル名', () => {
    expect(splitPath('a.md')).toEqual({ dir: '', name: 'a.md' });
  });

  it('空文字でも壊れない', () => {
    expect(splitPath('')).toEqual({ dir: '', name: '' });
  });
});

describe('joinPath', () => {
  it('ベースの区切り文字に合わせる', () => {
    expect(joinPath('C:\\work', 'a.md')).toBe('C:\\work\\a.md');
    expect(joinPath('/home/me', 'a.md')).toBe('/home/me/a.md');
  });

  it('`..` を畳まない（正規化は Rust の仕事 / N-SEC-05）', () => {
    // JS が思う正規形と、実際に解決される先がずれると、そこがスコープ検証の穴になる
    expect(joinPath('C:\\work\\docs', '../a.md')).toBe('C:\\work\\docs\\../a.md');
  });

  it('相対パスが絶対ならベースを無視する', () => {
    expect(joinPath('C:\\work', 'D:\\other\\a.md')).toBe('D:\\other\\a.md');
    expect(joinPath('/home/me', '/etc/a.md')).toBe('/etc/a.md');
  });

  it('ベースの末尾に区切りがあっても重ならない', () => {
    expect(joinPath('C:\\work\\', 'a.md')).toBe('C:\\work\\a.md');
    expect(joinPath('/home/me/', 'a.md')).toBe('/home/me/a.md');
  });

  it('先頭が区切り文字なら絶対パスとして扱う（開いているファイルからの相対にしない）', () => {
    expect(joinPath('C:\\work', '\\a.md')).toBe('\\a.md');
    expect(joinPath('/home/me', '/etc/a.md')).toBe('/etc/a.md');
  });

  it('ベースが無ければ相対パスをそのまま返す', () => {
    expect(joinPath('', 'a.md')).toBe('a.md');
  });
});

describe('isAbsolutePath', () => {
  it('Windows のドライブレターと UNC を絶対と見る', () => {
    expect(isAbsolutePath('C:\\work')).toBe(true);
    expect(isAbsolutePath('c:/work')).toBe(true);
    expect(isAbsolutePath('\\\\server\\share')).toBe(true);
    expect(isAbsolutePath('\\a.md')).toBe(true);
  });

  it('POSIX の絶対パスを絶対と見る', () => {
    expect(isAbsolutePath('/home')).toBe(true);
  });

  it('相対パスは絶対でない', () => {
    expect(isAbsolutePath('a.md')).toBe(false);
    expect(isAbsolutePath('./a.md')).toBe(false);
    expect(isAbsolutePath('../a.md')).toBe(false);
  });
});

describe('isMarkdownPath', () => {
  it('Markdown の拡張子を認める', () => {
    for (const p of ['a.md', 'a.markdown', 'a.MD', 'a.mkd', 'a.mdown']) {
      expect(isMarkdownPath(p), p).toBe(true);
    }
  });

  it('アンカーとクエリを落としてから見る', () => {
    expect(isMarkdownPath('./other.md#section')).toBe(true);
    expect(isMarkdownPath('./other.md?v=1')).toBe(true);
  });

  it('それ以外は Markdown でない', () => {
    for (const p of ['a.png', 'a.txt', 'a.exe', 'a.mdx', 'a']) {
      expect(isMarkdownPath(p), p).toBe(false);
    }
  });
});

describe('dirOf', () => {
  it('親ディレクトリを返す', () => {
    expect(dirOf('C:\\work\\a.md')).toBe('C:\\work');
  });
});
