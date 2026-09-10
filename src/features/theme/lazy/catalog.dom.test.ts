// @vitest-environment jsdom
// 注入した `<style>` をブラウザの CSS パーサに解釈させた結果まで見るので DOM が要る。
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getPlatform, setPlatform, type Platform, type UserTheme } from '@/platform';

import { applyTheme, listThemes, refreshUserThemes } from './catalog';
import { PRESETS } from './presets';

const original = getPlatform();

function stub(themes: UserTheme[]): void {
  setPlatform({ ...original, listUserThemes: () => Promise.resolve(themes) } as Platform);
}

function injected(): HTMLStyleElement | null {
  return document.querySelector<HTMLStyleElement>('style#mx-editor-theme');
}

function rules(): CSSRule[] {
  return [...(injected()?.sheet?.cssRules ?? [])];
}

beforeEach(async () => {
  document.head.replaceChildren();
  stub([]);
  await refreshUserThemes();
});

afterEach(() => {
  setPlatform(original);
});

describe('組み込みの配色 (ADR-0014)', () => {
  /**
   * 50 枚という数そのものが判断の対象である（ADR-0013 §5 の撤退線を踏んだ結果）。
   * 減っていたら、それは事故か、意図した変更であれば ADR を書き直す場面である。
   */
  it('50 枚ある', () => {
    expect(Object.keys(PRESETS)).toHaveLength(50);
  });

  /**
   * id は属性セレクタへ文字列として埋め込まれる。
   * 判定は `src-tauri/src/themes.rs` の `valid_id` と揃える。ユーザーが同じ名前のファイルを置いて
   * 組み込みを差し替えられることが前提なので、片方だけが通す綴りがあってはいけない。
   */
  it('id は themes.rs の valid_id が通す綴りに収まっている', () => {
    for (const id of Object.keys(PRESETS)) {
      expect(id, id).toMatch(/^[a-zA-Z0-9_-]{1,64}$/u);
    }
  });

  it('表示名が重複していない', () => {
    const labels = Object.values(PRESETS).map((preset) => preset.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe('配色の適用 (ADR-0014)', () => {
  it('default は何も注入しない', () => {
    expect(applyTheme('default')).toBe('default');
    expect(injected()?.textContent).toBe('');
  });

  it('組み込みの配色は、その id の属性セレクタ 1 つに収まる', () => {
    expect(applyTheme('dracula')).toBe('applied');

    expect(rules()).toHaveLength(1);
    const rule = rules()[0] as CSSStyleRule;
    expect(rule.selectorText.replaceAll('"', "'")).toBe("[data-mx-editor-theme='dracula']");
    expect(rule.style.getPropertyValue('--mx-color-bg')).toBe('#282a36');
  });

  /**
   * 明暗を固定する配色（ADR-0014 §3.2）。
   * `theme` 設定がライトでもダークで表示されるのは、この宣言が面に効くためである。
   */
  it('ダーク専用の配色は color-scheme を固定する', () => {
    applyTheme('dracula');
    expect((rules()[0] as CSSStyleRule).style.getPropertyValue('color-scheme')).toBe('dark');

    applyTheme('github');
    expect((rules()[0] as CSSStyleRule).style.getPropertyValue('color-scheme'), 'ペアは固定しない').toBe('');
  });

  /** 知らない綴りは既定へ落とさない。落とすと、打ち間違いと未適用を区別できない。 */
  it('カタログに無い id は何も注入せず unknown を返す', () => {
    expect(applyTheme('no-such-theme')).toBe('unknown');
    expect(injected()?.textContent).toBe('');
  });

  /** 選び直したら前のものは残らない。`<style>` は 1 枚を持ち回る。 */
  it('切り替えると前の配色は残らない', () => {
    applyTheme('dracula');
    applyTheme('monokai');

    expect(rules()).toHaveLength(1);
    expect((rules()[0] as CSSStyleRule).selectorText.replaceAll('"', "'")).toBe("[data-mx-editor-theme='monokai']");
  });
});

describe('ユーザーが追加した配色 (ADR-0014)', () => {
  it('themes/ のファイルは組み込みと同じカタログに載る', async () => {
    stub([{ id: 'mine', declarations: '--mx-color-bg: #010203;' }]);
    await refreshUserThemes();

    expect(listThemes().some((theme) => theme.id === 'mine' && theme.user)).toBe(true);
    expect(applyTheme('mine')).toBe('applied');
    expect((rules()[0] as CSSStyleRule).style.getPropertyValue('--mx-color-bg')).toBe('#010203');
  });

  /** 同じ名前で置けば組み込みを差し替えられる。設定を書き換えずに好みへ寄せる手段がこれである。 */
  it('同じ id ならユーザー側が勝つ', async () => {
    stub([{ id: 'dracula', declarations: '--mx-color-bg: #010203;' }]);
    await refreshUserThemes();

    applyTheme('dracula');
    expect((rules()[0] as CSSStyleRule).style.getPropertyValue('--mx-color-bg')).toBe('#010203');

    const listed = listThemes().filter((theme) => theme.id === 'dracula');
    expect(listed, '一覧に 2 度出さない').toHaveLength(1);
    expect(listed[0]?.user).toBe(true);
  });

  /**
   * **封じ込めが破れないこと。** ここがユーザー追加テーマの中核にあたる。
   * 波かっこを閉じて後ろに書いた規則は、面の外（クローム）へ届いてはいけない（ADR-0006）。
   */
  it('波かっこを閉じて外へ出る宣言は丸ごと拒否する', async () => {
    stub([{ id: 'escaping', declarations: '--mx-color-bg: #000000; } .mx-titlebar { display: none; ' }]);
    await refreshUserThemes();

    expect(applyTheme('escaping')).toBe('rejected');
    expect(injected()?.textContent).toBe('');
  });

  /** 一覧の束ね方に使う（`ThemeField.svelte`）。実際の挙動を決めるのは注入された CSS のほうである。 */
  it('color-scheme を書いた配色は、その明暗として一覧に出る', async () => {
    stub([{ id: 'mine', declarations: 'color-scheme: dark; --mx-color-bg: #010203;' }]);
    await refreshUserThemes();

    expect(listThemes().find((theme) => theme.id === 'mine')?.scheme).toBe('dark');
  });

  /** ファイルが 1 枚も無いのは正常な状態である（初回起動が常にこれ）。 */
  it('1 枚も無くても組み込みは選べる', () => {
    expect(listThemes()).toHaveLength(50);
    expect(applyTheme('nord')).toBe('applied');
  });
});
