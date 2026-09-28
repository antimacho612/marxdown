/**
 * ガイドの横断検索の索引。言語ごとに 1 つの JSON にして配信する（`search/<言語>.json`）。
 */
import { createContext } from '../context';
import { GUIDE_PAGES, type Locale } from '../routes';
import { loadGuide } from './guide';

export type SearchKind = 'page' | 'section' | 'shortcut' | 'setting' | 'syntax';

/** 索引の 1 件。配信する量を抑えるため、キーは 1 文字にしてある。 */
export interface SearchEntry {
  /** 種類 */
  k: SearchKind;
  /** 見出し */
  t: string;
  /** 補足（節の名前・設定のキーなど） */
  m: string;
  /** 右側に出すもの（キーの並びなど） */
  a: string;
  /** 移動先 */
  u: string;
}

export async function buildSearchIndex(locale: Locale): Promise<SearchEntry[]> {
  const entries: SearchEntry[] = [];

  for (const page of GUIDE_PAGES) {
    const ctx = createContext({ page, locale, path: '' }, '');
    const url = ctx.href(page);
    const pageTitle = ctx.m.guide.pages[page];
    entries.push({ k: 'page', t: pageTitle, m: ctx.m.guide.descriptions[page], a: '', u: url });

    const data = await loadGuide(page, locale);
    switch (data.page) {
      case 'start': {
        for (const item of data.toc)
          entries.push({ k: 'section', t: item.title, m: pageTitle, a: '', u: `${url}#${item.id}` });
        break;
      }
      case 'shortcuts': {
        for (const section of data.shortcuts.sections) {
          for (const row of section.rows) {
            entries.push({
              k: 'shortcut',
              t: row.action,
              m: section.title,
              a: row.keysText,
              u: `${url}#${section.id}`,
            });
          }
        }
        break;
      }
      case 'syntax': {
        for (const section of data.sections) {
          for (const example of section.examples) {
            entries.push({ k: 'syntax', t: example.title, m: section.title, a: '', u: `${url}#${example.id}` });
          }
        }
        break;
      }
      case 'settings': {
        for (const category of data.categories) {
          for (const group of category.groups) {
            for (const item of group.items) {
              entries.push({
                k: 'setting',
                t: item.label,
                m: `${category.label} · ${item.key}`,
                a: '',
                u: `${url}#${item.key}`,
              });
            }
          }
        }
        break;
      }
    }
  }

  return entries;
}
