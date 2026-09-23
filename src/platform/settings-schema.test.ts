/**
 * スキーマの検証（`settings-schema.ts`）。
 *
 * 型で表せない性質を扱う。
 * 既定値が許容範囲の中にあること、そして Rust 側の `Settings::default()` と一致していることの 2 つである。
 * 後者は `src-tauri/tests/settings-default.json` を挟んで両側から突き合わせており、Rust 側の同名のテストが同じファイルを見ている。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { clampSetting, DEFAULT_SETTINGS, isNumericKey, settingChoices, SETTINGS_SCHEMA } from './settings-schema';

function rustDefaults(): Record<string, unknown> {
  const path = fileURLToPath(new URL('../../src-tauri/tests/settings-default.json', import.meta.url));
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

describe('設定スキーマ (02.architecture/04-rust-responsibilities.md §5)', () => {
  /**
   * 既定値は 3 か所で一致させる必要がある（`src-tauri/src/settings/schema.rs` の冒頭）。
   * TypeScript・Rust・`src/styles/tokens.css` の 3 つを、ここで機械的に固定する。
   */
  it('既定値が Rust 側の Settings::default() と一致する', () => {
    expect(DEFAULT_SETTINGS).toEqual(rustDefaults());
  });

  /**
   * `tokens.css` 側の既定。
   *
   * 設定を書いていない利用者が見るのはこちらである（`applyAppearance` は既定値と同じなら書かずに消す）。
   * ずれると「設定を既定に戻したのに見た目が変わる」状態になる。
   */
  it.each([
    ['--mx-content-width', 'preview.maxWidth', 'ch'],
    ['--mx-font-size-content', 'preview.fontSize', 'px'],
    ['--mx-line-height', 'preview.lineHeight', ''],
  ] as const)('%s が %s の既定値と一致する', (property, key, unit) => {
    const tokens = readFileSync(fileURLToPath(new URL('../styles/tokens.css', import.meta.url)), 'utf8');
    const declared = new RegExp(`${property}:\\s*([^;]+);`).exec(tokens)?.[1]?.trim();

    expect(declared).toBe(`${DEFAULT_SETTINGS[key]}${unit}`);
  });

  it('キーの集合が Rust 側と一致する', () => {
    expect(Object.keys(SETTINGS_SCHEMA).toSorted()).toEqual(Object.keys(rustDefaults()).toSorted());
  });

  /** 範囲外の既定値は、設定 UI を開いた時点で範囲内に丸められて別の値になる。 */
  it('数値の既定値が許容範囲の中にある', () => {
    for (const [key, entry] of Object.entries(SETTINGS_SCHEMA)) {
      if (entry.kind !== 'number') continue;
      expect(entry.min, key).toBeLessThanOrEqual(entry.default);
      expect(entry.default, key).toBeLessThanOrEqual(entry.max);
    }
  });

  it('数値のキーだけが範囲を持つ', () => {
    for (const key of Object.keys(SETTINGS_SCHEMA)) {
      expect(isNumericKey(key as keyof typeof SETTINGS_SCHEMA), key).toBe(
        SETTINGS_SCHEMA[key as keyof typeof SETTINGS_SCHEMA].kind === 'number',
      );
    }
  });

  it('選択肢を持つのは enum のキーだけ', () => {
    expect(settingChoices('theme')).toEqual(['system', 'light', 'dark']);
    expect(settingChoices('editor.fontSize')).toEqual([]);
  });

  /** 丸めようがない値は既定値に戻す。`NaN` がそのまま CSS に渡ると宣言ごと無効になる。 */
  it('有限でない数値は既定値になる', () => {
    expect(clampSetting('preview.fontSize', Number.NaN)).toBe(DEFAULT_SETTINGS['preview.fontSize']);
    expect(clampSetting('preview.maxWidth', Number.POSITIVE_INFINITY)).toBe(DEFAULT_SETTINGS['preview.maxWidth']);
  });

  it('範囲を外れた数値は端に寄る', () => {
    expect(clampSetting('preview.maxWidth', 9999)).toBe(200);
    expect(clampSetting('preview.maxWidth', 0)).toBe(20);
  });

  /**
   * 配列の既定値をスキーマと共有すると、片方への書き込みがもう片方に見える。
   * `editor.rulers` は設定 UI から丸ごと置き換わるので症状は出ないが、共有していること自体を許さない。
   */
  it('配列の既定値はスキーマと別の実体である', () => {
    expect(DEFAULT_SETTINGS['editor.rulers']).not.toBe(SETTINGS_SCHEMA['editor.rulers'].default);
  });
});
