/**
 * `docs/keybindings.md` から、ショートカットの一覧を取り出す。
 *
 * 利用者向けの一覧はこのファイルが正であり、サイトは見せ方だけを変える。
 * 節（`##`）ごとに表を 1 つ持ち、表の後ろの段落は補足として扱う。
 */
import MarkdownIt from 'markdown-it';

import en from '../../../docs/keybindings.en.md?raw';
import ja from '../../../docs/keybindings.md?raw';
import type { Locale } from '../routes';

export interface ShortcutRow {
  /** `<kbd>` を含む HTML。 */
  keys: string;
  /** 検索用。タグを除いたキーの並び。 */
  keysText: string;
  action: string;
}

export interface ShortcutSection {
  id: string;
  title: string;
  rows: ShortcutRow[];
  /** 表の後ろにある補足の段落（HTML）。 */
  notes: string[];
}

export interface Shortcuts {
  /** 最初の節より前にある段落（HTML）。言語の切り替えの行は含まない。 */
  intro: string[];
  sections: ShortcutSection[];
}

const SOURCES: Record<Locale, string> = { ja, en };

/** 節の見出しから作るアンカー。ページ内で一意であればよい。 */
const SECTION_IDS: Record<Locale, readonly string[]> = {
  ja: ['file', 'navigation', 'view', 'search', 'format', 'explorer'],
  en: ['file', 'navigation', 'view', 'search', 'format', 'explorer'],
};

const md = new MarkdownIt({ html: true });

function stripTags(html: string): string {
  return html
    .replaceAll(/<[^>]+>/g, '')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}

/** 言語の切り替え（`日本語 | [English](...)`）の段落か。 */
function isLanguageSwitch(inline: string): boolean {
  return /\]\(keybindings(?:\.en)?\.md\)/.test(inline);
}

export function loadShortcuts(locale: Locale): Shortcuts {
  const tokens = md.parse(SOURCES[locale], {});
  const intro: string[] = [];
  const sections: ShortcutSection[] = [];
  let section: ShortcutSection | undefined;
  let row: string[] | undefined;

  for (const [index, token] of tokens.entries()) {
    const next = tokens[index + 1];
    if (token.type === 'heading_open' && token.tag === 'h2' && next) {
      section = {
        id: SECTION_IDS[locale][sections.length] ?? `section-${sections.length + 1}`,
        title: next.content,
        rows: [],
        notes: [],
      };
      sections.push(section);
    } else if (token.type === 'tr_open') {
      row = [];
    } else if (token.type === 'inline' && row && tokens[index - 1]?.type === 'td_open') {
      row.push(md.renderInline(token.content));
    } else if (token.type === 'tr_close' && row) {
      const [keys, action] = row;
      if (section && keys !== undefined && action !== undefined) {
        section.rows.push({ keys, keysText: stripTags(keys), action: stripTags(action) });
      }
      row = undefined;
    } else if (token.type === 'inline' && tokens[index - 1]?.type === 'paragraph_open') {
      if (isLanguageSwitch(token.content)) continue;
      // 原文は 1 文ごとに改行してある。日本語では改行が空白として表示されるため詰める。
      const html = md.renderInline(token.content).replaceAll('\n', locale === 'ja' ? '' : ' ');
      if (section) section.notes.push(html);
      else intro.push(html);
    }
  }

  return { intro, sections };
}
