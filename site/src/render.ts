/**
 * ページの描画の入口。ビルド時と開発時に、サーバ側で実行される（`build/plugin.ts`）。
 */
import { render } from 'svelte/server';

import pkg from '../../package.json';
import { createContext, type PageContext } from './context';
import Guide from './pages/Guide.svelte';
import Landing from './pages/Landing.svelte';
import { LOCALES, type Locale, type Route } from './routes';
import { loadGuide } from './server/guide';
import { loadLanding } from './server/landing';
import { buildSearchIndex } from './server/search';

/** 公開先。GitHub Pages のプロジェクトサイトで、`BASE` はこの後ろに付く。 */
const ORIGIN = 'https://antimacho612.github.io';

/** 外観の指定を、スタイルが当たる前に反映する。遅れると一瞬だけ OS の外観で表示される。 */
const THEME_BOOT = `(()=>{const d=document.documentElement;d.classList.replace('no-js','js');try{const t=localStorage.getItem('marxdown-site-theme');if(t==='light'||t==='dark')d.dataset.theme=t}catch{}})();`;

const ENTRIES = {
  home: '/src/client/landing.ts',
  guide: '/src/client/guide.ts',
} as const;

/**
 * ページごとの CSS。スクリプトではなく <link> で読み込み、最初の描画の前に当てる（`styles/common.css`）。
 * 共通部分を別のファイルにしてあるのは、ページを移動したときにブラウザのキャッシュを使えるようにするためである。
 */
const STYLES = {
  home: ['/src/styles/common.css', '/src/styles/window.css', '/src/styles/landing.css'],
  guide: ['/src/styles/common.css', '/src/styles/guide.css'],
} as const;

function escapeHtml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

/** Svelte がハイドレーションのために出力する印。ハイドレーションはしないので取り除く。 */
function stripMarkers(html: string): string {
  return html.replaceAll(/<!--(?:\[!?|\]|\$s\d+|)-->/g, '');
}

interface DocumentParts {
  title: string;
  description: string;
  body: string;
  head: string;
  entry: string;
  styles: readonly string[];
}

function documentHtml(ctx: PageContext, parts: DocumentParts): string {
  const { route, m } = ctx;
  const url = (locale: Locale) => `${ORIGIN}${ctx.href(route.page, locale)}`;
  const alternates = [
    ...LOCALES.map((locale) => `<link rel="alternate" hreflang="${locale}" href="${url(locale)}">`),
    `<link rel="alternate" hreflang="x-default" href="${url('ja')}">`,
  ].join('\n');

  return `<!doctype html>
<html lang="${route.locale}" class="no-js">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(parts.title)}</title>
<meta name="description" content="${escapeHtml(parts.description)}">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" media="(prefers-color-scheme: light)" content="#fbfbfd">
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0a0b0e">
<link rel="canonical" href="${url(route.locale)}">
${alternates}
<link rel="icon" href="${ctx.asset('favicon.svg')}" type="image/svg+xml">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${m.meta.siteName}">
<meta property="og:title" content="${escapeHtml(parts.title)}">
<meta property="og:description" content="${escapeHtml(parts.description)}">
<meta property="og:url" content="${url(route.locale)}">
<meta property="og:image" content="${ORIGIN}${ctx.asset('og.png')}">
<meta property="og:locale" content="${route.locale === 'ja' ? 'ja_JP' : 'en_US'}">
<meta name="twitter:card" content="summary_large_image">
<script>${THEME_BOOT}</script>
${parts.styles.map((href) => `<link rel="stylesheet" href="${href}">`).join('\n')}
${parts.head}
<script type="module" src="${parts.entry}"></script>
</head>
<body data-page="${route.page}">
${stripMarkers(parts.body)}
</body>
</html>
`;
}

export async function renderPage(route: Route): Promise<string> {
  const ctx = createContext(route, pkg.version);
  const { m } = ctx;

  if (route.page === 'home') {
    const data = await loadLanding(route.locale, m.themes.defaultName, m.bytes.edit);
    const { head, body } = render(Landing, { props: { ctx, data } });
    return documentHtml(ctx, {
      title: m.meta.title,
      description: m.meta.description,
      head,
      body,
      entry: ENTRIES.home,
      styles: STYLES.home,
    });
  }

  const data = await loadGuide(route.page, route.locale, ctx.asset('images/mark.svg'));
  const { head, body } = render(Guide, { props: { ctx, data } });
  return documentHtml(ctx, {
    title: `${m.guide.pages[route.page]} — ${m.meta.guideSuffix}`,
    description: m.guide.descriptions[route.page],
    head,
    body,
    entry: ENTRIES.guide,
    styles: STYLES.guide,
  });
}

export async function renderSearchIndex(locale: Locale): Promise<string> {
  return JSON.stringify(await buildSearchIndex(locale));
}
