/**
 * ガイドの各ページの中身を、ビルド時に作る。
 */
import startEn from '../content/guide/start.en.md?raw';
import startJa from '../content/guide/start.ja.md?raw';
import { sourceOf, SYNTAX } from '../content/syntax';
import type { GuidePageId, Locale } from '../routes';
import { loadShortcuts, type Shortcuts } from './keybindings';
import { highlightSource, renderDocument, renderMarkdown } from './markdown';
import { loadSettings, type SettingCategory } from './settings';

export interface TocItem {
  id: string;
  title: string;
  level: 2 | 3;
}

export interface RenderedExample {
  id: string;
  title: string;
  body: string;
  /** 色付けしたソースの行。 */
  source: string[];
  /** コピー用の元の文字列。 */
  raw: string;
  html: string;
  frontMatter: string | null;
  setting?: string;
  note?: string;
}

export interface RenderedSection {
  id: string;
  title: string;
  intro?: string;
  examples: RenderedExample[];
}

export type GuideData =
  | { page: 'start'; toc: TocItem[]; html: string }
  | { page: 'shortcuts'; toc: TocItem[]; shortcuts: Shortcuts }
  | { page: 'syntax'; toc: TocItem[]; sections: RenderedSection[] }
  | { page: 'settings'; toc: TocItem[]; categories: SettingCategory[] };

const START: Record<Locale, string> = { ja: startJa, en: startEn };

/** 見本の画像。書き方には `mark.svg` と書き、表示ではサイトに置いたファイルを指す。 */
const SAMPLE_IMAGE = /src="mark\.svg"/g;

/**
 * Marp の見本を、スライドの形に並べる。
 *
 * アプリは Marp の描画を別の経路（`markdown/marp.ts`）で行う。ここではテーマを当てず、スライドの区切りだけを再現する。
 */
async function renderSlides(source: string): Promise<string> {
  const slides = source.split(/^---$/m).slice(2);
  const html = await Promise.all(slides.map(async (slide) => renderMarkdown(slide.trim())));
  return html
    .map(
      (body, index) =>
        `<section class="marp-slide"><div>${body}</div><span class="marp-slide__page">${index + 1}</span></section>`,
    )
    .join('');
}

async function renderSyntax(locale: Locale, imageUrl: string): Promise<RenderedSection[]> {
  const sections: RenderedSection[] = [];
  for (const section of SYNTAX) {
    const examples: RenderedExample[] = [];
    for (const example of section.examples) {
      const raw = sourceOf(example, locale);
      const rendered = example.note
        ? { html: await renderSlides(raw), frontMatter: null }
        : await renderDocument(raw, example.setting ? { syntax: [example.setting] } : {});
      examples.push({
        id: example.id,
        title: example.title[locale],
        body: example.body[locale],
        source: highlightSource(raw),
        raw,
        html: rendered.html.replaceAll(SAMPLE_IMAGE, `src="${imageUrl}"`),
        frontMatter: rendered.frontMatter,
        ...(example.setting && { setting: `markdown.${example.setting}` }),
        ...(example.note && { note: example.note[locale] }),
      });
    }
    sections.push({
      id: section.id,
      title: section.title[locale],
      ...(section.intro && { intro: section.intro[locale] }),
      examples,
    });
  }
  return sections;
}

export async function loadGuide(page: GuidePageId, locale: Locale, imageUrl = ''): Promise<GuideData> {
  switch (page) {
    case 'start': {
      const { html, outline } = await renderDocument(START[locale]);
      return {
        page,
        html,
        toc: outline
          .filter((item) => item.level === 2 || item.level === 3)
          .map((item) => ({ id: item.slug, title: item.text, level: item.level as 2 | 3 })),
      };
    }
    case 'shortcuts': {
      const shortcuts = loadShortcuts(locale);
      return {
        page,
        shortcuts,
        toc: shortcuts.sections.map((section) => ({ id: section.id, title: section.title, level: 2 })),
      };
    }
    case 'syntax': {
      const sections = await renderSyntax(locale, imageUrl);
      return {
        page,
        sections,
        toc: sections.map((section) => ({ id: section.id, title: section.title, level: 2 })),
      };
    }
    case 'settings': {
      const categories = loadSettings(locale);
      return {
        page,
        categories,
        toc: categories.map((category) => ({ id: category.id, title: category.label, level: 2 })),
      };
    }
  }
}
