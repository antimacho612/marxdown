import { describe, expect, it } from 'vitest';

import { formatFontFamily, paletteAttr } from './format';

describe('formatFontFamily', () => {
  it('空白入りの名前も数字始まりも、引用符で包んで一様に扱う', () => {
    expect(formatFontFamily('Meiryo UI')).toBe('"Meiryo UI"');
    expect(formatFontFamily('  Yu Gothic  ')).toBe('"Yu Gothic"');
  });

  it('カンマ区切りで複数指定できる。ユーザーの引用符は剥がして付け直す', () => {
    expect(formatFontFamily("'Noto Sans JP', Meiryo")).toBe('"Noto Sans JP", "Meiryo"');
  });

  it('空文字と空白だけの指定は「指定なし」', () => {
    expect(formatFontFamily('')).toBeNull();
    expect(formatFontFamily(' , , ')).toBeNull();
  });

  /**
   * `settings.json` は手で書ける。検証されていない文字列が `font-family` の宣言に入る経路なので、引用符で囲えない文字を含む名前は除外する。
   */
  it('宣言を抜け出せる文字を含む名前は捨てる', () => {
    expect(formatFontFamily('Meiryo"; color: red; x: "')).toBeNull();
    expect(formatFontFamily('a}b')).toBeNull();
    expect(formatFontFamily('Meiryo, bad;name')).toBe('"Meiryo"');
  });
});

describe('paletteAttr', () => {
  it('既定の配色は属性を付けない', () => {
    expect(paletteAttr('default')).toBeUndefined();
  });

  it('既定以外はその綴りをそのまま返す', () => {
    expect(paletteAttr('nord')).toBe('nord');
  });
});
