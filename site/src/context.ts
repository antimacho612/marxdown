/**
 * ページの描画に共通して渡す情報。コンポーネントには `ctx` として渡す。
 */
import { REPOSITORY_URL } from '@/features/help/lazy/links';

import { en } from './content/en';
import { ja, type Messages } from './content/ja';
import { BASE, pathOf, type Locale, type PageId, type Route } from './routes';

export interface PageContext {
  route: Route;
  m: Messages;
  version: string;
  /** サイト内のページへのリンク。言語を省くと表示中のページと同じ言語にする。 */
  href: (page: PageId, locale?: Locale) => string;
  /** `public/` に置いたファイルへのリンク。 */
  asset: (path: string) => string;
}

export const LINKS = {
  repository: REPOSITORY_URL,
  releases: `${REPOSITORY_URL}/releases/latest`,
  changelog: `${REPOSITORY_URL}/blob/main/CHANGELOG.md`,
  bug: `${REPOSITORY_URL}/issues/new?template=bug_report.yml`,
  feature: `${REPOSITORY_URL}/issues/new?template=feature_request.yml`,
  security: `${REPOSITORY_URL}/security/policy`,
  license: `${REPOSITORY_URL}/blob/main/LICENSE`,
} as const;

const MESSAGES: Record<Locale, Messages> = { ja, en };

export function createContext(route: Route, version: string): PageContext {
  return {
    route,
    m: MESSAGES[route.locale],
    version,
    href: (page, locale = route.locale) => `${BASE}${pathOf(page, locale)}`,
    asset: (path) => `${BASE}${path}`,
  };
}
