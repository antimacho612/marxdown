import { describe, expect, it } from 'vitest';

import { resolveLocale } from './locale';

describe('resolveLocale', () => {
  it('設定で言語を指定したときは OS の言語を見ない', () => {
    expect(resolveLocale('ja', ['en-US'])).toBe('ja');
    expect(resolveLocale('en', ['ja-JP'])).toBe('en');
  });

  it('auto は OS の第一言語が日本語なら日本語にする', () => {
    expect(resolveLocale('auto', ['ja-JP', 'en-US'])).toBe('ja');
    expect(resolveLocale('auto', ['ja'])).toBe('ja');
  });

  it('auto は OS の第一言語が日本語以外なら英語にする', () => {
    expect(resolveLocale('auto', ['en-US', 'ja-JP'])).toBe('en');
    expect(resolveLocale('auto', ['de-DE'])).toBe('en');
    expect(resolveLocale('auto', [])).toBe('en');
  });

  it('言語タグの前方一致だけでは判定しない', () => {
    expect(resolveLocale('auto', ['jam'])).toBe('en');
  });
});
