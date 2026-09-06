/**
 * 設定 UI の並べ方の見張り（`layout.ts`）。
 *
 * 型で縛れるのはキー 1 本ごとの性質（部品とスキーマの `kind` が合っているか、選択肢のラベルが揃っているか）だけである。
 * 集合全体の性質（全キーが 1 度ずつ出ているか）は型で書くとエラーが読めなくなるので、実体をここで数える。
 */
import { describe, expect, it } from 'vitest';

import { SETTINGS_SCHEMA, type SettingKey } from '@/platform';

import { LAYOUT } from './layout';

function placedKeys(): SettingKey[] {
  return LAYOUT.flatMap((category) =>
    category.entries.filter((entry) => entry.kind === 'field').map((entry) => entry.key),
  );
}

describe('設定 UI の並べ方 (F-CONF-05 / ADR-0011)', () => {
  /**
   * スキーマにキーを足したのに画面へ置き忘れる、を防ぐ。
   * 設定ファイルに書けるのに GUI からは触れない項目が黙って増えると、「設定にあるはずなのに無い」になる。
   */
  it('スキーマの全キーが、ちょうど 1 回ずつ置かれている', () => {
    expect(placedKeys().toSorted()).toEqual(Object.keys(SETTINGS_SCHEMA).toSorted());
  });

  /** カテゴリ ID は `Navigation` の `{#each}` のキーになる。 */
  it('カテゴリ ID が重複していない', () => {
    const ids = LAYOUT.map((category) => category.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  /**
   * 選択肢のラベルはスキーマの `values` から引く（`SettingsDialog` の `choices`）。
   * 型でも縛っているが、i18n 側を書き換えたときに落ちる場所をここにも作っておく。
   */
  it('選択肢の項目は、スキーマの綴りをすべて持っている', () => {
    for (const category of LAYOUT) {
      for (const entry of category.entries) {
        if (entry.kind !== 'field') continue;
        if (entry.widget !== 'select' && entry.widget !== 'radio') continue;

        const schema = SETTINGS_SCHEMA[entry.key];
        expect(schema.kind, entry.key).toBe('enum');
        if (schema.kind !== 'enum') continue;
        expect(Object.keys(entry.labels).toSorted(), entry.key).toEqual(schema.values.toSorted());
      }
    }
  });
});
