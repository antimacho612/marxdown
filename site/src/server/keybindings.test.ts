import { describe, expect, it } from 'vitest';

import { loadShortcuts } from './keybindings';

describe('loadShortcuts', () => {
  it('日本語版と英語版で、節と行の数が一致する', () => {
    // 片方だけ行を足すと、言語を切り替えたときに載っているショートカットが変わる。
    const ja = loadShortcuts('ja');
    const en = loadShortcuts('en');
    expect(ja.sections.map((section) => section.rows.length)).toEqual(
      en.sections.map((section) => section.rows.length),
    );
  });

  it('どの行もキーと操作を持つ', () => {
    for (const section of loadShortcuts('ja').sections) {
      expect(section.rows.length).toBeGreaterThan(0);
      for (const row of section.rows) {
        expect(row.keysText).not.toBe('');
        expect(row.action).not.toBe('');
      }
    }
  });

  it('言語の切り替えの段落は本文に含めない', () => {
    expect(loadShortcuts('ja').intro.join('')).not.toContain('English');
  });
});
