/**
 * 追加記法の設定 → パイプラインへ渡す一覧（04.tech-stack/04-markdown.md §3）。
 *
 * **設定キーと記法名がずれると、ON にしても何も起きない。**
 * 型では気づけないため、ここで両側から突き合わせる。
 */
import { describe, expect, it } from 'vitest';

import { SYNTAX_NAMES } from '@/markdown/plugins/syntax';
import { DEFAULT_SETTINGS, SETTINGS_SCHEMA } from '@/platform';

import { enabledSyntax } from './syntax';

/** `markdown.*` のキーから接頭辞を外したもの。 */
const KEYS_IN_SCHEMA = Object.keys(SETTINGS_SCHEMA)
  .filter((key) => key.startsWith('markdown.'))
  .map((key) => key.slice('markdown.'.length))
  .toSorted();

describe('設定キーと記法名の対応', () => {
  it('両側の一覧が一致する', () => {
    expect(KEYS_IN_SCHEMA).toEqual([...SYNTAX_NAMES].toSorted());
  });

  it('どれも既定 OFF である', () => {
    expect(enabledSyntax(DEFAULT_SETTINGS)).toEqual([]);
  });
});

describe('有効なものの取り出し', () => {
  it('ON にしたものだけを返す', () => {
    const values = { ...DEFAULT_SETTINGS, 'markdown.subscript': true, 'markdown.marks': true };
    expect(enabledSyntax(values)).toEqual(['marks', 'subscript']);
  });

  it('並びが安定している（キャッシュの一致判定に使うため）', () => {
    const a = { ...DEFAULT_SETTINGS, 'markdown.superscript': true, 'markdown.abbreviations': true };
    const b = { ...DEFAULT_SETTINGS, 'markdown.abbreviations': true, 'markdown.superscript': true };
    expect(enabledSyntax(a)).toEqual(enabledSyntax(b));
  });

  it('`markdown.` 以外のキーを拾わない', () => {
    const values = { ...DEFAULT_SETTINGS, 'preview.softBreak': true, 'editor.fontLigatures': true };
    expect(enabledSyntax(values)).toEqual([]);
  });
});
