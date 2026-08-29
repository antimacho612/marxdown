// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS, type Settings } from '@/platform';

import { applyAppearance, clampSetting, formatFontFamily } from './appearance';

function root(): HTMLElement {
  return document.documentElement;
}

/** `:root` に**インラインで書かれた**カスタムプロパティの一覧。 */
function written(): string[] {
  const style = root().style;
  return Array.from({ length: style.length }, (_, i) => style.item(i)).filter((name) => name.startsWith('--mx-'));
}

function withSettings(patch: Partial<Settings>): Settings {
  return { ...DEFAULT_SETTINGS, ...patch };
}

beforeEach(() => {
  root().removeAttribute('style');
  delete root().dataset['theme'];
});

describe('applyAppearance', () => {
  /**
   * 06.roadmap/m1.5-shell-and-settings.md §3 の完了条件「設定を一度も開かない状態の見た目が M1 から
   * 劣化していない」。**既定値を書き込む実装にすると、ここが黙って壊れる。**
   * トークン層（`tokens.css`）と二重管理になり、片方だけ直した瞬間にずれる。
   */
  it('既定値なら、カスタムプロパティを 1 つも書かない', () => {
    applyAppearance(DEFAULT_SETTINGS);

    expect(written()).toEqual([]);
    expect(root().dataset['theme']).toBeUndefined();
  });

  it('既定値に戻すと、書いたものを消す（既定値で上書きしない）', () => {
    applyAppearance(withSettings({ 'preview.maxWidth': 80, theme: 'dark' }));
    expect(written()).toEqual(['--mx-content-width']);

    applyAppearance(DEFAULT_SETTINGS);

    expect(written()).toEqual([]);
    expect(root().dataset['theme']).toBeUndefined();
  });

  /** OS 追従は `tokens.css` の `@media` が担当する。属性を**外す**のがその合図。 */
  it('テーマを data-theme に当てる。system は属性ごと外す', () => {
    applyAppearance(withSettings({ theme: 'dark' }));
    expect(root().dataset['theme']).toBe('dark');

    applyAppearance(withSettings({ theme: 'light' }));
    expect(root().dataset['theme']).toBe('light');

    applyAppearance(withSettings({ theme: 'system' }));
    expect(root().dataset['theme']).toBeUndefined();
  });

  it('本文幅の単位は ch（02.architecture/10-theming.md §2）', () => {
    applyAppearance(withSettings({ 'preview.maxWidth': 72 }));

    expect(root().style.getPropertyValue('--mx-content-width')).toBe('72ch');
  });

  it('文字サイズは px、行間は無次元', () => {
    applyAppearance(withSettings({ 'preview.fontSize': 18, 'preview.lineHeight': 2 }));

    expect(root().style.getPropertyValue('--mx-font-size-content')).toBe('18px');
    expect(root().style.getPropertyValue('--mx-line-height')).toBe('2');
  });

  /**
   * F-CONF-04。**指定されたフォントは既定スタックの前に足す。**
   * 置き換えると、そのフォントに無い字の落とし先（混植スタック）が消える。
   */
  it('フォントは既定スタックの先頭に足す', () => {
    applyAppearance(withSettings({ 'preview.codeFontFamily': 'BIZ UD Gothic', 'preview.fontFamily': 'Noto Sans JP' }));

    expect(root().style.getPropertyValue('--mx-font-code')).toBe('"BIZ UD Gothic", var(--mx-font-code-stack)');
    expect(root().style.getPropertyValue('--mx-font-content')).toBe('"Noto Sans JP", var(--mx-font-content-stack)');
  });

  it('フォントが空文字なら、トークン層のスタックをそのまま使う', () => {
    applyAppearance(withSettings({ 'preview.codeFontFamily': '  ', 'preview.fontFamily': '  ' }));

    expect(written()).toEqual([]);
  });

  /** Rust 側が潰し損ねた値（手書きの settings.json）でもレイアウトを壊さない。 */
  it('範囲外の数値は潰してから当てる', () => {
    applyAppearance(withSettings({ 'preview.maxWidth': 100_000 }));

    expect(root().style.getPropertyValue('--mx-content-width')).toBe('200ch');
  });
});

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
   * `settings.json` は手で書ける。**検証されていない文字列**が
   * `font-family` の宣言に入る経路なので、包めない文字を含む名前は捨てる。
   */
  it('宣言を抜け出せる文字を含む名前は捨てる', () => {
    expect(formatFontFamily('Meiryo"; color: red; x: "')).toBeNull();
    expect(formatFontFamily('a}b')).toBeNull();
    expect(formatFontFamily('Meiryo, bad;name')).toBe('"Meiryo"');
  });
});

describe('clampSetting (src-tauri/src/settings.rs と揃える)', () => {
  it('上下限で潰す', () => {
    expect(clampSetting('preview.fontSize', 0)).toBe(8);
    expect(clampSetting('preview.fontSize', 999)).toBe(72);
    expect(clampSetting('preview.lineHeight', 0.1)).toBe(1);
    expect(clampSetting('preview.maxWidth', 1)).toBe(20);
  });

  it('数値でない値は既定に落とす', () => {
    expect(clampSetting('preview.fontSize', Number.NaN)).toBe(DEFAULT_SETTINGS['preview.fontSize']);
  });
});
