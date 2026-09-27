import { describe, expect, it } from 'vitest';

import { nameProblem, stemRange, withDefaultExtension } from './name';

describe('nameProblem', () => {
  it('使える名前は通す', () => {
    expect(nameProblem('note.md', [])).toBeNull();
    expect(nameProblem('.env', [])).toBeNull();
    expect(nameProblem('console.md', [])).toBeNull();
  });

  it('Rust 側（fsops::validate_name）と同じ名前を拒む', () => {
    expect(nameProblem('', [])).toBe('empty');
    expect(nameProblem('..', [])).toBe('dots');
    expect(nameProblem('a/b', [])).toBe('chars');
    expect(nameProblem('a\\b', [])).toBe('chars');
    expect(nameProblem('a:b', [])).toBe('chars');
    expect(nameProblem('trailing.', [])).toBe('trailing');
    expect(nameProblem('trailing ', [])).toBe('trailing');
    expect(nameProblem('CON.md', [])).toBe('reserved');
    expect(nameProblem('com1 .txt', [])).toBe('reserved');
    expect(nameProblem('a'.repeat(256), [])).toBe('tooLong');
  });

  it('同じ階層の名前は大文字と小文字を区別せずに衝突とみなす', () => {
    expect(nameProblem('A.md', ['a.md'])).toBe('exists');
  });

  it('大文字と小文字だけを変えるリネームは通す', () => {
    expect(nameProblem('README.md', ['readme.md', 'other.md'], 'readme.md')).toBeNull();
    expect(nameProblem('other.md', ['readme.md', 'other.md'], 'readme.md')).toBe('exists');
  });
});

describe('withDefaultExtension', () => {
  it('拡張子が無ければ .md を補う', () => {
    expect(withDefaultExtension('notes')).toBe('notes.md');
    expect(withDefaultExtension('notes.txt')).toBe('notes.txt');
    expect(withDefaultExtension('.env')).toBe('.env');
  });
});

describe('stemRange', () => {
  it('ファイルは拡張子を除いた部分を選ぶ', () => {
    expect(stemRange('a.b.md', false)).toEqual([0, 3]);
    expect(stemRange('.env', false)).toEqual([0, 4]);
    expect(stemRange('dir.v2', true)).toEqual([0, 6]);
  });
});
