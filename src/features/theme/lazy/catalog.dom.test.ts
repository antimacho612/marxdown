// @vitest-environment jsdom
// 注入した `<style>` をブラウザの CSS パーサに解釈させた結果まで見るので DOM が要る。
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getPlatform, setPlatform, type Platform, type UserTheme } from '@/platform';

import type { Surface } from '../inject';
import { applyTheme, listThemes, refreshUserThemes } from './catalog';
import { PRESETS } from './presets';

const original = getPlatform();

function stub(themes: UserTheme[]): void {
  setPlatform({ ...original, listUserThemes: () => Promise.resolve(themes) } as Platform);
}

function injected(surface: Surface = 'editor'): HTMLStyleElement | null {
  return document.querySelector<HTMLStyleElement>(`style#mx-${surface}-theme`);
}

function rules(surface: Surface = 'editor'): CSSRule[] {
  return [...(injected(surface)?.sheet?.cssRules ?? [])];
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
   * 50 枚という数そのものが設計上の決定である（ADR-0014）。
   * 減っている場合は誤りであり、意図した変更であれば新しい ADR で記録する。
   */
  it('50 枚ある', () => {
    expect(Object.keys(PRESETS)).toHaveLength(50);
  });

  /**
   * id は属性セレクタへ文字列として埋め込まれる。
   * 判定は `src-tauri/src/themes.rs` の `valid_id` と揃える。ユーザーが同じ名前のファイルを置いて組み込みを差し替えられることが前提なので、片方だけが通す綴りがあってはいけない。
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
    expect(applyTheme('editor', 'default')).toBe('default');
    expect(injected()?.textContent).toBe('');
  });

  it('組み込みの配色は、その id の属性セレクタ 1 つに収まる', () => {
    expect(applyTheme('editor', 'dracula')).toBe('applied');

    expect(rules()).toHaveLength(1);
    const rule = rules()[0] as CSSStyleRule;
    expect(rule.selectorText.replaceAll('"', "'")).toBe("[data-mx-editor-theme='dracula']");
    expect(rule.style.getPropertyValue('--mx-color-bg')).toBe('#282a36');
  });

  /**
   * 明暗を固定する配色（ADR-0014 §3.2）。
   * `theme` 設定がライトでもダークで表示されるのは、この宣言が面に適用されるためである。
   */
  it('ダーク専用の配色は color-scheme を固定する', () => {
    applyTheme('editor', 'dracula');
    expect((rules()[0] as CSSStyleRule).style.getPropertyValue('color-scheme')).toBe('dark');

    applyTheme('editor', 'github');
    expect((rules()[0] as CSSStyleRule).style.getPropertyValue('color-scheme'), 'ペアは固定しない').toBe('');
  });

  /** 知らない綴りは既定に置き換えない。置き換えると、打ち間違いと未適用を区別できない。 */
  it('カタログに無い id は何も注入せず unknown を返す', () => {
    expect(applyTheme('editor', 'no-such-theme')).toBe('unknown');
    expect(injected()?.textContent).toBe('');
  });

  /** 選び直したら前のものは残らない。`<style>` は面ごとに 1 枚を持ち回る。 */
  it('切り替えると前の配色は残らない', () => {
    applyTheme('editor', 'dracula');
    applyTheme('editor', 'monokai');

    expect(rules()).toHaveLength(1);
    expect((rules()[0] as CSSStyleRule).selectorText.replaceAll('"', "'")).toBe("[data-mx-editor-theme='monokai']");
  });

  /**
   * カタログは共通でも、注入先と属性は面ごとに別である（ADR-0014 §3.3）。
   * 属性名を共有すると、エディターで選んだ `github` が `#mx-preview` にも一致する。
   */
  it('プレビューとエディターは互いの配色を上書きしない', () => {
    applyTheme('preview', 'github');
    applyTheme('editor', 'dracula');

    expect((rules('preview')[0] as CSSStyleRule).selectorText.replaceAll('"', "'")).toBe("[data-mx-theme='github']");
    expect((rules('editor')[0] as CSSStyleRule).selectorText.replaceAll('"', "'")).toBe(
      "[data-mx-editor-theme='dracula']",
    );

    // 片方を既定へ戻しても、もう片方は残る。
    applyTheme('preview', 'default');
    expect(injected('preview')?.textContent).toBe('');
    expect(rules('editor')).toHaveLength(1);
  });
});

describe('ユーザーが追加した配色 (ADR-0014)', () => {
  it('themes/ のファイルは組み込みと同じカタログに載る', async () => {
    stub([{ id: 'mine', declarations: '--mx-color-bg: #010203;' }]);
    await refreshUserThemes();

    expect(listThemes().some((theme) => theme.id === 'mine' && theme.user)).toBe(true);
    expect(applyTheme('editor', 'mine')).toBe('applied');
    expect((rules()[0] as CSSStyleRule).style.getPropertyValue('--mx-color-bg')).toBe('#010203');
  });

  /** 同じ名前で置けば組み込みを差し替えられる。設定を書き換えずに好みの配色へ変更する手段がこれである。 */
  it('同じ id ならユーザー側が勝つ', async () => {
    stub([{ id: 'dracula', declarations: '--mx-color-bg: #010203;' }]);
    await refreshUserThemes();

    applyTheme('editor', 'dracula');
    expect((rules()[0] as CSSStyleRule).style.getPropertyValue('--mx-color-bg')).toBe('#010203');

    const listed = listThemes().filter((theme) => theme.id === 'dracula');
    expect(listed, '一覧に 2 度出さない').toHaveLength(1);
    expect(listed[0]?.user).toBe(true);
  });

  /**
   * 封じ込めが破れないこと。
   * ここがユーザー追加テーマの中核にあたる。
   * 波かっこを閉じて後ろに書いた規則は、面の外（クローム）へ届いてはいけない（ADR-0006）。
   */
  it('波かっこを閉じて外へ出る宣言は丸ごと拒否する', async () => {
    stub([{ id: 'escaping', declarations: '--mx-color-bg: #000000; } .mx-titlebar { display: none; ' }]);
    await refreshUserThemes();

    expect(applyTheme('editor', 'escaping')).toBe('rejected');
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
    expect(applyTheme('editor', 'nord')).toBe('applied');
  });
});
