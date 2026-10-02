/**
 * ページを Svelte コンポーネントから生成する Vite プラグイン。
 *
 * ページの HTML はディスク上に置かず、`src/render.ts` をサーバ側で実行して作る。
 * 開発時はリクエストごとに、ビルド時は入口の `load` で 1 回ずつ描画する。
 * 描画側はアプリ本体のモジュール（設定のスキーマ・文言・Markdown のパイプライン）をそのまま読み込むため、ページの内容がアプリの実装からずれない。
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';

import { svelte } from '@sveltejs/vite-plugin-svelte';
import { createServer, normalizePath, type Plugin, type UserConfig, type ViteDevServer } from 'vite';

import { BASE, findRoute, LOCALES, ROUTES, type Locale, type Route } from '../src/routes';

const SITE = fileURLToPath(new URL('..', import.meta.url));
const APP_SRC = fileURLToPath(new URL('../../src', import.meta.url));
const SVELTE_CONFIG = fileURLToPath(new URL('../../svelte.config.js', import.meta.url));

/**
 * 依存の事前バンドルの置き場所。
 *
 * 既定の `node_modules/.vite` はアプリ本体の開発サーバと共有になり、同時に起動すると互いの書き込みで失敗する。
 */
export const CACHE_DIR = fileURLToPath(new URL('../../node_modules/.vite-site', import.meta.url));

/**
 * リポジトリの別の場所から、そのまま配信するファイル。
 *
 * SNS で共有したときの画像は、GitHub の Social Preview と同じ画像を使う。複製して置くと、差し替え忘れが起きる。
 */
const EXTRA_ASSETS: Record<string, string> = {
  'og.png': fileURLToPath(new URL('../../assets/social-preview.ja.png', import.meta.url)),
  'og.en.png': fileURLToPath(new URL('../../assets/social-preview.png', import.meta.url)),
};

/** サーバ側で実行する描画の入口。`root` からの絶対パスで指定する。 */
const RENDER_ENTRY = '/src/render.ts';

/** `src/render.ts` が公開するもの。 */
interface RenderModule {
  renderPage: (route: Route) => Promise<string>;
  renderSearchIndex: (locale: Locale) => Promise<string>;
  renderSitemap: () => string;
}

/**
 * サイト本体と、描画用のサーバの両方に共通する設定。
 *
 * プラグインのインスタンスは設定ごとに別のものが要るため、関数にしてある。
 */
export function sharedConfig(): UserConfig & { plugins: Plugin[] } {
  return {
    base: BASE,
    plugins: [svelte({ configFile: SVELTE_CONFIG }) as Plugin[]].flat(),
    resolve: { alias: { '@': APP_SRC } },
  };
}

function searchIndexName(locale: Locale): string {
  return `search/${locale}.json`;
}

export function pages(): Plugin {
  let root = SITE;
  let dev: ViteDevServer | undefined;
  // ビルド時はページの数だけ `load` が並行して呼ばれる。サーバの生成を 1 回にするため、Promise を持つ。
  let loader: Promise<ViteDevServer> | undefined;

  const htmlOf = (route: Route): string => normalizePath(path.join(root, route.path, 'index.html'));

  const routeOf = (id: string): Route | undefined => {
    const relative = normalizePath(path.relative(root, id));
    if (relative.startsWith('..') || !relative.endsWith('index.html')) return undefined;
    return findRoute(relative);
  };

  async function renderer(): Promise<RenderModule> {
    const server =
      dev ??
      (await (loader ??= createServer({
        ...sharedConfig(),
        configFile: false,
        root: SITE,
        cacheDir: CACHE_DIR,
        logLevel: 'error',
        appType: 'custom',
        server: { middlewareMode: true, hmr: false, ws: false },
        optimizeDeps: { noDiscovery: true, include: [] },
      })));
    return (await server.ssrLoadModule(RENDER_ENTRY)) as RenderModule;
  }

  return {
    name: 'marxdown-site:pages',

    config(_, { command }) {
      if (command !== 'build') return;
      const input = Object.fromEntries(
        ROUTES.map((route) => [route.path === '' ? 'index' : route.path.slice(0, -1), htmlOf(route)]),
      );
      return { build: { rollupOptions: { input } } };
    },

    configResolved(config) {
      root = config.root;
    },

    resolveId(id) {
      return routeOf(id) ? normalizePath(id) : null;
    },

    async load(id) {
      const route = routeOf(id);
      if (!route) return null;
      const module = await renderer();
      return module.renderPage(route);
    },

    async generateBundle() {
      for (const [fileName, source] of Object.entries(EXTRA_ASSETS)) {
        this.emitFile({ type: 'asset', fileName, source: readFileSync(source) });
      }
      const module = await renderer();
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: module.renderSitemap() });
      for (const locale of LOCALES) {
        this.emitFile({
          type: 'asset',
          fileName: searchIndexName(locale),
          source: await module.renderSearchIndex(locale),
        });
      }
    },

    async closeBundle() {
      const server = await loader;
      await server?.close();
      loader = undefined;
    },

    configureServer(server) {
      dev = server;

      server.middlewares.use(async (req, res, next) => {
        const pathname = decodeURIComponent((req.url ?? '/').split('?', 1)[0] ?? '/');
        if (!pathname.startsWith(BASE)) {
          if (pathname === '/' || pathname === BASE.slice(0, -1)) {
            res.writeHead(302, { Location: BASE }).end();
            return;
          }
          next();
          return;
        }
        const rest = pathname.slice(BASE.length);

        const extra = EXTRA_ASSETS[rest];
        if (extra) {
          res.end(readFileSync(extra));
          return;
        }

        if (rest === 'sitemap.xml') {
          const module = await renderer();
          res.setHeader('Content-Type', 'application/xml; charset=utf-8');
          res.end(module.renderSitemap());
          return;
        }

        const search = LOCALES.find((locale) => rest === searchIndexName(locale));
        const route = findRoute(rest);
        if (!search && !route) {
          next();
          return;
        }

        try {
          const module = await renderer();
          if (search) {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(await module.renderSearchIndex(search));
          } else if (route) {
            const html = await server.transformIndexHtml(req.originalUrl ?? pathname, await module.renderPage(route));
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.end(html);
          }
        } catch (error) {
          if (error instanceof Error) server.ssrFixStacktrace(error);
          next(error);
        }
      });
    },

    // NOTE: ページはサーバ側で描画しているため、HMR では反映できない。どのファイルの変更でも再読み込みする。
    handleHotUpdate({ server }) {
      server.ws.send({ type: 'full-reload' });
      return [];
    },
  };
}
