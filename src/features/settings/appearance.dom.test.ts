// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';

import { clampSetting, DEFAULT_SETTINGS, type Settings } from '@/platform';

import { applyAppearance } from './appearance';

function root(): HTMLElement {
  return document.documentElement;
}

/** `:root` にインラインで書かれたカスタムプロパティの一覧。 */
function written(): string[] {
  const style = root().style;
  return Array.from({ length: style.length }, (_, i) => style.item(i)).filter((name) => name.startsWith('--mx-'));
}

function withSettings(patch: Partial<Settings>): Settings {
  return { ...DEFAULT_SETTINGS, ...patch };
}

function surface(id: string): HTMLElement {
  return document.querySelector<HTMLElement>(`#${id}`) as HTMLElement;
}

beforeEach(() => {
  root().removeAttribute('style');
  delete root().dataset['theme'];

  // 配色の受け皿（ADR-0013）。実アプリでは `index.html` にあり、起動時から存在する。
  document.body.replaceChildren();
  for (const id of ['mx-preview', 'mx-editor']) {
    const element = document.createElement('div');
    element.id = id;
    document.body.append(element);
  }
});

describe('applyAppearance', () => {
  /**
   * F-CONF-02。設定を一度も変更していない状態では、トークン層（`tokens.css`）の値をそのまま使う。
   * 既定値を書き込む実装にすると `tokens.css` と二重管理になり、片方だけ直した時点でずれる。
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

  /** OS 追従は `tokens.css` の `@media` が担当する。属性を外すことで OS 追従になる。 */
  it('テーマを data-theme に当てる。system は属性ごと外す', () => {
    applyAppearance(withSettings({ theme: 'dark' }));
    expect(root().dataset['theme']).toBe('dark');

    applyAppearance(withSettings({ theme: 'light' }));
    expect(root().dataset['theme']).toBe('light');

    applyAppearance(withSettings({ theme: 'system' }));
    expect(root().dataset['theme']).toBeUndefined();
  });

  it('本文幅の単位は ch（02.architecture/10-theming.md §2）', () => {
    // 既定（72）以外を渡す。既定と同じ値は書かずに消す仕様であり、単位を確かめられない。
    applyAppearance(withSettings({ 'preview.maxWidth': 90 }));

    expect(root().style.getPropertyValue('--mx-content-width')).toBe('90ch');
  });

  it('文字サイズは px、行間は無次元', () => {
    applyAppearance(withSettings({ 'preview.fontSize': 18, 'preview.lineHeight': 2 }));

    expect(root().style.getPropertyValue('--mx-font-size-content')).toBe('18px');
    expect(root().style.getPropertyValue('--mx-line-height')).toBe('2');
  });

  /**
   * F-CONF-04。指定されたフォントは既定スタックの前に追加する。
   * 置き換えると、そのフォントに無い文字のフォールバック先（混植スタック）が無くなる。
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

  /** Rust 側で丸められなかった値（手書きの settings.json）でもレイアウトを壊さない。 */
  it('範囲外の数値は潰してから当てる', () => {
    applyAppearance(withSettings({ 'preview.maxWidth': 100_000 }));

    expect(root().style.getPropertyValue('--mx-content-width')).toBe('200ch');
  });
});

describe('clampSetting (src-tauri/src/settings/schema.rs と揃える)', () => {
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

/**
 * 配色（F-CONF-08 / ADR-0013 / ADR-0014）。
 *
 * 検証するのは 4 つである。面ごとに独立していること、属性名が面ごとに違うこと、既定では属性が付かないこと、`:root` には決して付かないこと（クロームの配色をテーマで動かさない）。
 */
describe('applyPalette (ADR-0013 / ADR-0014)', () => {
  it('既定では属性を付けない', () => {
    applyAppearance(DEFAULT_SETTINGS);

    expect(surface('mx-preview').dataset['mxTheme']).toBeUndefined();
    expect(surface('mx-editor').dataset['mxEditorTheme']).toBeUndefined();
  });

  it('面ごとに独立して当たる', () => {
    applyAppearance(withSettings({ 'preview.theme': 'solarized', 'editor.theme': 'dracula' }));

    expect(surface('mx-preview').dataset['mxTheme']).toBe('solarized');
    expect(surface('mx-editor').dataset['mxEditorTheme']).toBe('dracula');
  });

  /**
   * 属性名を分けてあること（ADR-0014 §3.3）。
   *
   * カタログは共通であり、id も面の間で共通である。
   * 同じ属性名だと、エディター用に注入した規則が `#mx-preview` にも一致し、本文の配色が選択と食い違う。
   */
  it('エディター側は本文と違う属性を使う', () => {
    applyAppearance(withSettings({ 'preview.theme': 'github', 'editor.theme': 'github' }));

    expect(surface('mx-editor').dataset['mxTheme'], '本文用の属性は付けない').toBeUndefined();
    expect(surface('mx-preview').dataset['mxEditorTheme'], 'その逆も').toBeUndefined();
  });

  /** 組み込みに無い綴りも既定に置き換えず属性に設定する（ADR-0014）。 */
  it('知らない綴りもそのまま属性になる', () => {
    applyAppearance(withSettings({ 'editor.theme': 'my-own-theme' }));

    expect(surface('mx-editor').dataset['mxEditorTheme']).toBe('my-own-theme');
  });

  it('既定に戻すと属性ごと外れる', () => {
    applyAppearance(withSettings({ 'preview.theme': 'gruvbox' }));
    applyAppearance(DEFAULT_SETTINGS);

    expect(surface('mx-preview').dataset['mxTheme']).toBeUndefined();
  });

  /**
   * クロームの配色はテーマで動かさない（ADR-0013）。
   * `:root` に付けると、タイトルバーもステータスバーも通知バーも配色が変わる。
   */
  it(':root には決して付けない', () => {
    applyAppearance(withSettings({ 'preview.theme': 'github', 'editor.theme': 'github' }));

    expect(root().dataset['mxTheme']).toBeUndefined();
    expect(root().dataset['mxEditorTheme']).toBeUndefined();
  });

  /** 面がまだ無い経路（テストの一部）で例外にならないこと。 */
  it('面が無ければ何もしない', () => {
    document.body.replaceChildren();

    expect(() => applyAppearance(withSettings({ 'preview.theme': 'nord' }))).not.toThrow();
  });
});

describe('applyTableStyle (preview.tableStyle)', () => {
  it('既定（横罫線のみ）では属性を付けない', () => {
    applyAppearance(DEFAULT_SETTINGS);

    expect(surface('mx-preview').dataset['mxTableStyle']).toBeUndefined();
  });

  it('選んだ引き方が本文の面に付く', () => {
    applyAppearance(withSettings({ 'preview.tableStyle': 'zebra' }));

    expect(surface('mx-preview').dataset['mxTableStyle']).toBe('zebra');
  });

  it('既定に戻すと属性ごと外れる', () => {
    applyAppearance(withSettings({ 'preview.tableStyle': 'grid' }));
    applyAppearance(DEFAULT_SETTINGS);

    expect(surface('mx-preview').dataset['mxTableStyle']).toBeUndefined();
  });

  /** 配色と同じく、クロームには適用しない（ADR-0013）。 */
  it(':root には付けない', () => {
    applyAppearance(withSettings({ 'preview.tableStyle': 'grid' }));

    expect(root().dataset['mxTableStyle']).toBeUndefined();
  });
});
