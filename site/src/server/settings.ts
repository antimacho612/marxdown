/**
 * 設定の一覧。アプリの設定画面と同じ並び・同じ文言で作る。
 *
 * 並びは `features/settings/lazy/layout.ts`、既定値と範囲は `platform/settings-schema.ts` から取る。
 * どちらも設定画面が使うものそのままなので、キーを足せばこのページにも現れる。
 */
import { buildLayout, type FieldEntry } from '@/features/settings/lazy/layout';
import { enSettings } from '@/i18n/en/settings';
import { jaSettings } from '@/i18n/ja/settings';
import { tSettings } from '@/i18n/settings';
import { SETTINGS_SCHEMA, type SettingKey } from '@/platform/settings-schema';

import type { Locale } from '../routes';

export interface SettingOption {
  value: string;
  label: string;
}

export interface SettingItem {
  key: SettingKey;
  label: string;
  description: string;
  /** 既定値の表示。空の値は `null`。 */
  defaultValue: string | null;
  kind: 'enum' | 'number' | 'boolean' | 'string' | 'list' | 'theme';
  options: SettingOption[];
  range: { min: number; max: number } | null;
}

export interface SettingGroup {
  /** 節の見出し。カテゴリの先頭の項目は見出しを持たない。 */
  label: string | null;
  items: SettingItem[];
}

export interface SettingCategory {
  id: string;
  label: string;
  groups: SettingGroup[];
}

const MESSAGES = { ja: jaSettings, en: enSettings } as const;

const ON_OFF: Record<Locale, readonly [on: string, off: string]> = {
  ja: ['オン', 'オフ'],
  en: ['On', 'Off'],
};

function describe(entry: FieldEntry, locale: Locale): SettingItem {
  const schema = SETTINGS_SCHEMA[entry.key];
  const base = {
    key: entry.key,
    label: entry.label,
    description: entry.description ?? '',
    options: [] as SettingOption[],
    range: null,
  };

  switch (entry.widget) {
    case 'radio':
    case 'select': {
      const labels = entry.labels as Readonly<Record<string, string>>;
      const options = Object.entries(labels).map(([value, label]) => ({ value, label }));
      const fallback = String(schema.default);
      return {
        ...base,
        kind: 'enum',
        options,
        defaultValue: options.find((option) => option.value === fallback)?.label ?? fallback,
      };
    }
    case 'number': {
      if (schema.kind !== 'number') break;
      return {
        ...base,
        kind: 'number',
        defaultValue: String(schema.default),
        range: { min: schema.min, max: schema.max },
      };
    }
    case 'toggle': {
      const [on, off] = ON_OFF[locale];
      return { ...base, kind: 'boolean', defaultValue: schema.default === true ? on : off };
    }
    case 'theme': {
      return { ...base, kind: 'theme', defaultValue: MESSAGES[locale].paletteDefault };
    }
    case 'text': {
      const value = String(schema.default);
      return { ...base, kind: 'string', defaultValue: value === '' ? (entry.placeholder ?? null) : value };
    }
    case 'list': {
      const value = Array.isArray(schema.default) ? schema.default.join(', ') : '';
      return { ...base, kind: 'list', defaultValue: value === '' ? null : value };
    }
  }
  return { ...base, kind: 'string', defaultValue: String(schema.default) };
}

/**
 * カテゴリごとの設定項目。
 *
 * NOTE: `buildLayout` は文言を `tSettings` から読む。`tSettings` は 1 つの言語しか持てないため、呼ぶたびに中身を差し替える。
 */
export function loadSettings(locale: Locale): SettingCategory[] {
  Object.assign(tSettings, MESSAGES[locale]);

  return buildLayout().map((category) => {
    const groups: SettingGroup[] = [{ label: null, items: [] }];
    for (const entry of category.entries) {
      if (entry.kind === 'section') groups.push({ label: entry.label, items: [] });
      else if (entry.kind === 'field') groups.at(-1)?.items.push(describe(entry, locale));
    }
    return { id: category.id, label: category.label, groups: groups.filter((group) => group.items.length > 0) };
  });
}
