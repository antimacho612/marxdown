import { describe, expect, it } from 'vitest';

import { SETTINGS_SCHEMA } from '@/platform/settings-schema';

import { LOCALES } from '../routes';
import { loadSettings } from './settings';

describe('loadSettings', () => {
  it.each(LOCALES)('すべての設定キーを 1 回ずつ載せる（%s）', (locale) => {
    const keys = loadSettings(locale).flatMap((category) =>
      category.groups.flatMap((group) => group.items.map((item) => item.key)),
    );
    expect(keys.toSorted()).toEqual(Object.keys(SETTINGS_SCHEMA).toSorted());
  });

  it('言語を切り替えると文言も切り替わる', () => {
    const ja = loadSettings('ja')[0]?.label;
    const en = loadSettings('en')[0]?.label;
    expect(ja).not.toBe(en);
  });
});
