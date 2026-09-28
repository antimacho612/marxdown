/**
 * サイトのページ一覧。
 *
 * ビルド設定（ページの入口）と描画（ナビゲーション・言語の切り替え）の両方がここを参照する。
 */

export const LOCALES = ['ja', 'en'] as const;

export type Locale = (typeof LOCALES)[number];

export type PageId = 'home' | 'start' | 'shortcuts' | 'syntax' | 'settings';

/** ガイドのページ。並びがそのままサイドバーの順になる。 */
export const GUIDE_PAGES = ['start', 'shortcuts', 'syntax', 'settings'] as const satisfies readonly PageId[];

export type GuidePageId = (typeof GUIDE_PAGES)[number];

/** 公開する URL の接頭辞。リポジトリ名と一致させる（GitHub Pages のプロジェクトサイト）。 */
export const BASE = '/marxdown/';

export interface Route {
  page: PageId;
  locale: Locale;
  /** `BASE` からの相対パス。末尾は `/` で終わる（トップは空文字）。 */
  path: string;
}

const SEGMENTS: Record<PageId, string> = {
  home: '',
  start: 'guide/',
  shortcuts: 'guide/shortcuts/',
  syntax: 'guide/syntax/',
  settings: 'guide/settings/',
};

/** ページと言語から、`BASE` を含まないパスを作る。 */
export function pathOf(page: PageId, locale: Locale): string {
  return `${locale === 'ja' ? '' : `${locale}/`}${SEGMENTS[page]}`;
}

/** 公開するすべてのページ。 */
export const ROUTES: readonly Route[] = LOCALES.flatMap((locale) =>
  (Object.keys(SEGMENTS) as PageId[]).map((page) => ({ page, locale, path: pathOf(page, locale) })),
);

/** `BASE` を除いたパス（先頭の `/` の有無は問わない）からページを引く。 */
export function findRoute(path: string): Route | undefined {
  const normalized = path.replace(/^\/+/, '').replace(/index\.html$/, '');
  return ROUTES.find((route) => route.path === normalized);
}
