/**
 * ファイルツリーの表示フィルター（F-NAV-03）。
 *
 * 見たいのは 2 つ。
 * ディレクトリが絞り込みの対象にならないこと（畳んだ枝の中身は開くまで分からない）と、
 * 拡張子フィルターが Markdown フィルターより優先されることである。
 */
import { beforeEach, describe, expect, it } from 'vitest';

import type { DirEntry } from '@/platform';

import { filterStore, parseExtensions, resetFilter, visibleEntries } from './filter.svelte';

function file(name: string): DirEntry {
  return { name, path: `C:/work/${name}`, dir: false };
}

function folder(name: string): DirEntry {
  return { name, path: `C:/work/${name}`, dir: true };
}

const ENTRIES: DirEntry[] = [
  folder('docs'),
  file('README.md'),
  file('notes.markdown'),
  file('package.json'),
  file('logo.PNG'),
  file('.gitignore'),
  file('LICENSE'),
];

function names(entries: readonly DirEntry[]): string[] {
  return entries.map((entry) => entry.name);
}

beforeEach(() => {
  resetFilter();
});

describe('parseExtensions', () => {
  it('カンマ・読点・空白のいずれでも区切れる', () => {
    expect(parseExtensions('md, txt　png')).toEqual(['md', 'txt', 'png']);
    expect(parseExtensions('md、txt')).toEqual(['md', 'txt']);
  });

  it('先頭のドットと glob の星を落とす', () => {
    expect(parseExtensions('.md *.txt')).toEqual(['md', 'txt']);
  });

  it('小文字に揃えて重複を取り除く', () => {
    expect(parseExtensions('MD md Md')).toEqual(['md']);
  });

  it('空の入力は空の並びになる', () => {
    expect(parseExtensions('  ,  ')).toEqual([]);
  });
});

describe('visibleEntries', () => {
  it('絞り込んでいなければ受け取った配列をそのまま返す', () => {
    expect(visibleEntries(ENTRIES)).toBe(ENTRIES);
  });

  it('Markdown フィルターは Markdown の拡張子だけを残す', () => {
    filterStore.markdownOnly = true;

    expect(names(visibleEntries(ENTRIES))).toEqual(['docs', 'README.md', 'notes.markdown']);
  });

  it('拡張子フィルターは指定した拡張子だけを残す', () => {
    filterStore.extensionsInput = 'json, png';

    expect(names(visibleEntries(ENTRIES))).toEqual(['docs', 'package.json', 'logo.PNG']);
  });

  it('拡張子フィルターが Markdown フィルターより優先される', () => {
    filterStore.markdownOnly = true;
    filterStore.extensionsInput = 'json';

    expect(names(visibleEntries(ENTRIES))).toEqual(['docs', 'package.json']);
  });

  it('ディレクトリはどの条件でも残る', () => {
    filterStore.extensionsInput = 'md';

    expect(names(visibleEntries(ENTRIES))).toContain('docs');
  });

  it('拡張子を持たないファイルは絞り込むと消える', () => {
    filterStore.extensionsInput = 'md';

    const visible = names(visibleEntries(ENTRIES));
    expect(visible).not.toContain('LICENSE');
    // 先頭のドットは拡張子ではない。`gitignore` を指定しても現れない。
    expect(visible).not.toContain('.gitignore');
  });
});
