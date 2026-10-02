#!/usr/bin/env node
/**
 * README・紹介サイト・SNS 用のスクリーンショットを撮る。
 *
 * アプリのフロントエンドをブラウザ用の Platform 実装（`src/platform/web.ts`）で動かし、Chromium で撮影する。
 * 画面はアプリと同じコードで描画されるが、ウィンドウの枠とフォントは Windows の実機と異なる。
 *
 * ```bash
 * pnpm exec vite build && pnpm exec vite preview --port 4300 --strictPort
 * node scripts/screenshots/capture.mjs
 * ```
 *
 * NOTE: playwright-core は依存に入れていない。別の場所に入れ、その `index.mjs` のパスを `PLAYWRIGHT_CORE` で渡す。
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', '..', 'assets', 'screenshots');
const APP = process.env.MARXDOWN_APP_URL ?? 'http://localhost:4300/';
const CHROMIUM = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const DOC_PATH = 'C:/work/sync/docs/architecture.md';

const sample = (lang) => readFileSync(join(HERE, 'samples', `architecture.${lang}.md`), 'utf8');

/**
 * @typedef {object} Shot
 * @property {string} name
 * @property {'en' | 'ja'} lang
 * @property {Record<string, unknown>} [settings]
 * @property {string} [query]
 * @property {string} [scrollTo] 見出しの id。プレビューをその見出しまで送る。
 * @property {number} [width]
 * @property {number} [height]
 * @property {(page: import('playwright-core').Page) => Promise<void>} [before]
 */

/** @type {Shot[]} */
const SHOTS = [];

for (const lang of /** @type {const} */ (['en', 'ja'])) {
  const architecture = lang === 'en' ? 'architecture' : '構成';
  const dataModel = lang === 'en' ? 'data-model' : 'データモデル';
  SHOTS.push(
    { name: `hero.${lang}`, lang, query: 'rightPane', scrollTo: architecture },
    { name: `reading.${lang}`, lang, settings: { theme: 'dark' }, query: 'rightPane', height: 1000 },
    {
      name: `split.${lang}`,
      lang,
      query: 'mode=split',
      scrollTo: dataModel,
      settings: { theme: 'dark', 'preview.theme': 'tokyo-night', 'editor.theme': 'tokyo-night' },
    },
    {
      name: `typography.${lang}`,
      lang,
      scrollTo: lang === 'en' ? 'summary' : '概要',
      settings: {
        'preview.theme': 'flexoki',
        'preview.fontFamily': lang === 'en' ? 'Noto Serif' : 'Noto Serif CJK JP',
        'preview.fontSize': 18,
        'preview.lineHeight': 2,
        'preview.maxWidth': 56,
      },
    },
  );
}

const THEMES = [
  { id: 'github', scheme: 'light' },
  { id: 'rose-pine', scheme: 'light' },
  { id: 'gruvbox', scheme: 'dark' },
  { id: 'tokyo-night', scheme: 'dark' },
  { id: 'nord', scheme: 'dark' },
  { id: 'flexoki', scheme: 'light' },
];
for (const { id, scheme } of THEMES) {
  SHOTS.push({
    name: `themes/${id}`,
    lang: 'en',
    width: 1200,
    height: 760,
    scrollTo: 'options-compared',
    settings: { theme: scheme, 'preview.theme': id, 'editor.theme': id },
  });
}

const browser = await chromium.launch({ executablePath: CHROMIUM });
mkdirSync(join(OUT, 'themes'), { recursive: true });

const only = process.env.ONLY;
const targets = SHOTS.filter((s) => !only || s.name.startsWith(only));
for (const shot of targets) {
  const page = await browser.newPage({
    viewport: { width: shot.width ?? 1440, height: shot.height ?? 900 },
    deviceScaleFactor: 1,
  });
  const settings = { theme: 'light', 'ui.language': shot.lang, ...shot.settings };
  await page.addInitScript(
    ([content, path, state]) => {
      localStorage.setItem('marxdown:web-fs', JSON.stringify({ [path]: { content, mtimeMs: Date.now() } }));
      localStorage.setItem('marxdown:web-state', JSON.stringify({ settings: state }));
    },
    [sample(shot.lang), DOC_PATH, settings],
  );
  const query = [shot.query, `file=${encodeURIComponent(DOC_PATH)}`].filter(Boolean).join('&');
  await page.goto(`${APP}?${query}`);
  await page.waitForTimeout(3500);
  if (shot.scrollTo) {
    await page.evaluate((id) => {
      const heading = document.getElementById(id);
      const preview = document.querySelector('.mx-preview');
      if (heading && preview) preview.scrollTop += heading.getBoundingClientRect().top - 72;
    }, shot.scrollTo);
    await page.waitForTimeout(800);
  }
  await shot.before?.(page);
  await page.screenshot({ path: join(OUT, `${shot.name}.png`) });
  await page.close();
  console.log(`${shot.name}.png`);
}

await browser.close();
