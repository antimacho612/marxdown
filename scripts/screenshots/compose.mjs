#!/usr/bin/env node
/**
 * `capture.mjs` で撮った画面から、SNS 用の画像と CLI の図を組み立てる。
 *
 * ```bash
 * node scripts/screenshots/compose.mjs
 * ```
 *
 * 書き出すもの。
 * - `assets/social-preview.png` GitHub の Social Preview（1280 × 640）。英語。
 * - `assets/social-preview.ja.png` 紹介サイトの日本語ページの OGP 画像。
 * - `assets/screenshots/cli.{en,ja}.png` ターミナルからアプリを開く図。ターミナルは HTML で描いた再現である。
 * - `assets/screenshots/window.{en,ja}.png` README の先頭に置く、影を付けたウィンドウ。
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');

const HERE = dirname(fileURLToPath(import.meta.url));
const ASSETS = join(HERE, '..', '..', 'assets');
const CHROMIUM = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const dataUrl = (path, type) => `data:${type};base64,${readFileSync(path).toString('base64')}`;
const shot = (name) => dataUrl(join(ASSETS, 'screenshots', name), 'image/png');
const logo = dataUrl(join(ASSETS, 'logo-light.svg'), 'image/svg+xml');

const FONT = `'Inter', 'Segoe UI', 'Noto Sans CJK JP', 'Yu Gothic UI', sans-serif`;

const COPY = {
  en: {
    title: 'Don’t open VS Code<br>just to read a Markdown file.',
    sub: 'A fast, reading-first Markdown viewer for Windows.<br>Edit when you need to.',
    prompt: 'PS C:\\work\\sync>',
    command: 'marxdown docs\\architecture.md',
  },
  ja: {
    title: 'Markdown を読むために、<br>VS Code を開きたくない。',
    sub: 'Markdown を読むことを中心に設計した<br>Windows 向けビューアー／エディター。',
    prompt: 'PS C:\\work\\sync>',
    command: 'marxdown docs\\architecture.md',
  },
};

const BASE_CSS = `
  * { box-sizing: border-box; margin: 0; }
  body { font-family: ${FONT}; -webkit-font-smoothing: antialiased; }
  .window { border-radius: 10px; overflow: hidden; border: 1px solid rgb(0 0 0 / 0.14);
    box-shadow: 0 2px 6px rgb(0 0 0 / 0.08), 0 24px 64px rgb(20 24 40 / 0.22); background: #fff; }
  .window img { display: block; width: 100%; }
`;

function social(lang) {
  const t = COPY[lang];
  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}
    body { width: 1280px; height: 640px; overflow: hidden; position: relative;
      background: radial-gradient(1200px 600px at 100% 0%, #e9ecff 0%, #f7f7fb 55%, #fbfbfd 100%); }
    .copy { position: absolute; left: 72px; top: 92px; width: 640px; }
    .logo { height: 56px; }
    h1 { margin-top: 64px; font-size: ${lang === 'en' ? 44 : 42}px; line-height: 1.22; letter-spacing: -0.02em;
      color: #14161f; font-weight: 750; }
    p { margin-top: 28px; font-size: 24px; line-height: 1.5; color: #4a5068; }
    .shot { position: absolute; left: 720px; top: 110px; width: 900px; }
  </style></head><body>
    <div class="copy"><img class="logo" src="${logo}" alt=""><h1>${t.title}</h1><p>${t.sub}</p></div>
    <div class="window shot"><img src="${shot(`hero.${lang}.png`)}" alt=""></div>
  </body></html>`;
}

function cli(lang) {
  const t = COPY[lang];
  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}
    body { width: 1600px; height: 900px; background: transparent; position: relative; }
    .app { position: absolute; left: 300px; top: 40px; width: 1260px; }
    .term { position: absolute; left: 40px; top: 560px; width: 720px; border-radius: 10px; overflow: hidden;
      background: #0c0c0c; color: #cccccc; border: 1px solid #3a3a3a;
      box-shadow: 0 24px 64px rgb(0 0 0 / 0.35); font-family: 'Cascadia Code', Consolas, monospace; }
    .bar { height: 40px; background: #1f1f1f; display: flex; align-items: center; padding: 0 14px; gap: 8px;
      font: 13px ${FONT}; color: #ddd; }
    .tab { background: #0c0c0c; padding: 9px 16px; border-radius: 8px 8px 0 0; margin-top: 8px; }
    pre { padding: 20px 22px 26px; font: 17px/1.7 'Cascadia Code', Consolas, monospace; white-space: pre; }
    .cmd { color: #f9f1a5; }
    .caret { display: inline-block; width: 9px; height: 19px; background: #ccc; vertical-align: -3px; }
  </style></head><body>
    <div class="window app"><img src="${shot(`hero.${lang}.png`)}" alt=""></div>
    <div class="term">
      <div class="bar"><span class="tab">Windows PowerShell</span></div>
      <pre>${t.prompt} <span class="cmd">marxdown</span> docs\\architecture.md
${t.prompt} <span class="caret"></span></pre>
    </div>
  </body></html>`;
}

function framed(lang) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}
    body { width: 1520px; padding: 24px 40px 56px; background: transparent; }
  </style></head><body><div class="window"><img src="${shot(`hero.${lang}.png`)}" alt=""></div></body></html>`;
}

const browser = await chromium.launch({ executablePath: CHROMIUM });

async function render(html, out, size, transparent = false) {
  const page = await browser.newPage({ viewport: size, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.waitForTimeout(300);
  await page.screenshot({ path: out, omitBackground: transparent, fullPage: transparent });
  await page.close();
  console.log(out);
}

for (const lang of /** @type {const} */ (['en', 'ja'])) {
  await render(social(lang), join(ASSETS, lang === 'en' ? 'social-preview.png' : 'social-preview.ja.png'), {
    width: 1280,
    height: 640,
  });
  await render(cli(lang), join(ASSETS, 'screenshots', `cli.${lang}.png`), { width: 1600, height: 900 }, true);
  await render(framed(lang), join(ASSETS, 'screenshots', `window.${lang}.png`), { width: 1520, height: 980 }, true);
}

await browser.close();
