/**
 * ページの描画の入口。ビルド時と開発時に、サーバ側で実行される（`build/plugin.ts`）。
 */
import { render } from 'svelte/server';

import pkg from '../../package.json';
import { createContext, LINKS, type PageContext } from './context';
import Guide from './pages/Guide.svelte';
import Landing from './pages/Landing.svelte';
import { LOCALES, ROUTES, type Locale, type Route } from './routes';
import { loadGuide } from './server/guide';
import { loadLanding } from './server/landing';
import { buildSearchIndex } from './server/search';

/** 公開先。GitHub Pages のプロジェクトサイトで、`BASE` はこの後ろに付く。 */
const ORIGIN = 'https://antimacho612.github.io';

/**
 * GoatCounter のサイトコード（`<code>.goatcounter.com` の `<code>`）。空のあいだは計測のスクリプトを出力しない。
 *
 * Cookie を使わず、個人を識別しない集計だけを行う。ダウンロードの導線のクリックは `data-goatcounter-click` で数える。
 */
const GOATCOUNTER_CODE = 'antimacho612';

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
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll(String.raw`<`, '&lt;')
    .replaceAll('>', '&gt;');
}

/**
 * Svelte がハイドレーションのために出力する印（`<!--[-->` や `<!--$s1-->` など）。ハイドレーションはしないので取り除く。
 *
 * 印は空白を含まない。空白を含む通常のコメントは残す。
 */
function stripMarkers(html: string): string {
  return html.replaceAll(/<!--[^\s>]*-->/g, '');
}

interface DocumentParts {
  title: string;
  description: string;
  body: string;
  head: string;
  entry: string;
  styles: readonly string[];
}

function analyticsTag(): string {
  if (!GOATCOUNTER_CODE) return '';
  return `<script data-goatcounter="https://${GOATCOUNTER_CODE}.goatcounter.com/count" async src="https://gc.zgo.at/count.js"></script>`;
}

/** 検索エンジンにアプリとして認識させる構造化データ。トップページにだけ付ける。 */
function structuredData(ctx: PageContext, pageUrl: string): string {
  const { m, version } = ctx;
  const data = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: m.meta.siteName,
    description: m.meta.description,
    url: pageUrl,
    inLanguage: ctx.route.locale,
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Windows 10, Windows 11',
    softwareVersion: version,
    downloadUrl: LINKS.releases,
    license: LINKS.license,
    image: `${ORIGIN}${ctx.url('og.png')}`,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  };
  // NOTE: `</script>` で JSON が途切れないよう、`<` をエスケープする。
  return `<script type="application/ld+json">${JSON.stringify(data).replaceAll('<', String.raw`\u003c`)}</script>`;
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
<meta name="google-site-verification" content="AmgZXOiTTdMAO6LKB1cJW_4tBV12fb9uZ0-oINm5lvs">
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
<meta property="og:image" content="${ORIGIN}${ctx.url('og.png')}">
<meta property="og:locale" content="${route.locale === 'ja' ? 'ja_JP' : 'en_US'}">
<meta property="og:image:alt" content="${escapeHtml(m.meta.imageAlt)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(parts.title)}">
<meta name="twitter:description" content="${escapeHtml(parts.description)}">
<meta name="twitter:image" content="${ORIGIN}${ctx.url('og.png')}">
${route.page === 'home' ? structuredData(ctx, url(route.locale)) : ''}
${analyticsTag()}
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

/**
 * `sitemap.xml`。全ページを列挙し、各ページに言語違いの URL を `hreflang` で対応づける。
 *
 * `robots.txt` はホストのルートにしか置けず、このサイトの公開先（プロジェクトサイト）では管理できない。検索エンジンへは Search Console から送る。
 */
export function renderSitemap(): string {
  const locUrl = (route: Route) => `${ORIGIN}${createContext(route, pkg.version).href(route.page)}`;
  const entries = ROUTES.map((route) => {
    const alternates = LOCALES.map((locale) => {
      const alt = ROUTES.find((r) => r.page === route.page && r.locale === locale);
      return alt ? `    <xhtml:link rel="alternate" hreflang="${locale}" href="${locUrl(alt)}"/>` : '';
    }).join('\n');
    return `  <url>\n    <loc>${locUrl(route)}</loc>\n${alternates}\n  </url>`;
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...entries,
    '</urlset>',
    '',
  ].join('\n');
}
