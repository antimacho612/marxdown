/**
 * Marp のスライドを DOM に組み立てる（F-VIEW-17 / ADR-0023 §3.3）。
 *
 * marp-core の出力は不活性な `<template>` の中で SVG の枠から取り出し、`<section>` だけを `sanitizeMarp` に通す。
 * 枠（`<svg>` / `<foreignObject>`）はこちらで作り直し、marp-core の出力から引き継ぐのは検証した寸法の属性だけである。
 * サニタイザに `<foreignObject>` を許可しないためである（ADR-0006）。
 *
 * テーマの CSS は `#mx-preview { … }` の入れ子にして 1 枚の `<style>` に入れる。
 * 閉じ込めの判定は配色の注入（`features/theme/inject.ts`）と同じく、ブラウザに解釈させた規則の数とセレクタだけを見る。
 * 入れ子にすると ID の分だけ詳細度が上がり、アプリのプレビュー用の規則（`.mx-preview pre` など）より優先される。
 */
import { jaMarp } from '@/i18n/ja-marp';
import type { MarpRender } from '@/markdown/protocol';
import { isAllowedUri, sanitizeMarp } from '@/markdown/sanitize';
import { getPlatform } from '@/platform';

const SVG_NS = 'http://www.w3.org/2000/svg';
const SCOPE = '#mx-preview';

/** marp-core が出力する枠の寸法。分割背景では `50%` のような百分率が入る。 */
const VIEW_BOX = /^0 0 \d+(?:\.\d+)? \d+(?:\.\d+)?$/;
const LENGTH = /^\d+(?:\.\d+)?%?$/;
const FRAME_ATTRIBUTES = ['width', 'height', 'x', 'y'] as const;
const LAYER_ATTRIBUTE = 'data-marpit-advanced-background';
const LAYERS = new Set(['background', 'content', 'pseudo']);

/** CSSOM が正規化した `url("…")`。中の `"` と `\` はエスケープされている。 */
const CSS_URL = /url\("((?:[^"\\]|\\.)*)"\)/g;
/** そのまま表示できる URL。`preview/enhance.ts` の判定と同じ。 */
const READY = /^(?:https?:|data:|asset:|blob:)/i;

/**
 * スライドの並べ方と、アプリのプレビュー用の規則の打ち消し。
 *
 * 打ち消しの詳細度は (1,1,0) で、アプリの規則（ID を含まない）より高く、入れ子にしたテーマの規則（(1,1,4) 以上）より低い。
 * テーマが指定しない性質はブラウザの既定値に戻り、Marp CLI の出力と同じになる。
 * 数式は KaTeX の CSS で描くため打ち消さない。
 */
const LAYOUT = `
${SCOPE} .mx-marp {
  display: flex;
  flex-direction: column;
  gap: var(--mx-space-6);
  max-width: var(--mx-content-width);
  margin-inline: auto;
}
${SCOPE} .mx-marp > svg {
  display: block;
  width: 100%;
  height: auto;
  box-shadow: 0 1px 4px oklch(0 0 0 / 0.3);
}
${SCOPE} .mx-marp :where(section, section :not(.mx-math, .mx-math *)) {
  all: revert;
}
${SCOPE} .mx-marp .mx-copy {
  display: none;
}
`;

/** 前回の入れ子の結果。Split では打鍵のたびに描き直すため、テーマの CSS が変わらなければ判定を省く。 */
let nested: { css: string; result: string | null } | null = null;

/** 相対パスの背景画像の解決結果。キーは `baseDir` と参照の組。 */
const resolved = new Map<string, Promise<string | null>>();

/** `mountMarp` の結果。 */
export interface MountResult {
  /**
   * 通知バーに出す文言。無ければ `null`。
   *
   * テーマの CSS がスライドの外へ出る場合を、自作テーマを読み込めなかった場合より優先する。表示が崩れるのは前者だけである。
   */
  notice: string | null;
}

/**
 * スライドを `container` の末尾に組み立てる。
 *
 * 呼び出し側が先に `container` を空にしておくこと（`features/preview/marp.ts`）。
 * `<style>` も `container` の中に置くため、次の描画で本文と一緒に外れる。
 */
export function mountMarp(container: HTMLElement, marp: MarpRender, baseDir: string): MountResult {
  const deck = document.createElement('div');
  // NOTE: テーマの CSS のセレクタは `div.marpit > svg > foreignObject > section` の形である。
  deck.className = 'marpit mx-marp';
  for (const html of marp.slides) {
    const svg = rebuildSlide(html);
    if (svg) deck.append(svg);
  }

  const theme = nest(marp.css);
  const style = document.createElement('style');
  style.textContent = LAYOUT + (theme ?? '');
  container.append(style, deck);

  void resolveBackgrounds(deck, baseDir);
  return { notice: theme === null ? jaMarp.styleRejected : themeNotice(marp.themeProblems ?? []) };
}

function themeNotice(problems: NonNullable<MarpRender['themeProblems']>): string | null {
  const first = problems[0];
  return first ? jaMarp.themeFailed(jaMarp.themeProblem[first.kind], first.path, problems.length - 1) : null;
}

/** 保持しているものを解放する（N-PERF-06）。文書を閉じたときに呼ぶ。 */
export function disposeMarp(): void {
  nested = null;
  resolved.clear();
}

/**
 * 1 枚分の `<svg data-marpit-svg>` を作り直す。
 *
 * 形が想定と違えば、そのスライドは出さない。
 * 分割背景では 1 枚に `<foreignObject>` が 3 つ（背景・本文・ページ番号用）並ぶ。
 */
function rebuildSlide(html: string): SVGSVGElement | null {
  const template = document.createElement('template');
  template.innerHTML = html;
  const source = template.content.firstElementChild;
  if (source?.namespaceURI !== SVG_NS || source.localName !== 'svg') return null;

  const viewBox = source.getAttribute('viewBox') ?? '';
  if (!VIEW_BOX.test(viewBox)) return null;

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', viewBox);
  svg.setAttribute('data-marpit-svg', '');

  for (const frame of source.children) {
    if (frame.localName !== 'foreignObject') continue;
    const section = frame.querySelector(':scope > section');
    if (!section) continue;

    const clean = document.createElement('template');
    clean.innerHTML = sanitizeMarp(section.outerHTML);
    const sanitized = clean.content.firstElementChild;
    if (sanitized?.localName !== 'section') continue;
    // NOTE: 不活性な `<template>` の中の要素では、Chromium は `style` を CSSOM として解釈しない。検証の前に本文の document へ移す。
    const slide = document.adoptNode(sanitized);
    if (!(slide instanceof HTMLElement)) continue;
    checkStyleUrls(slide);

    const foreignObject = document.createElementNS(SVG_NS, 'foreignObject');
    for (const name of FRAME_ATTRIBUTES) {
      const value = frame.getAttribute(name);
      if (value !== null && LENGTH.test(value)) foreignObject.setAttribute(name, value);
    }
    const layer = frame.getAttribute(LAYER_ATTRIBUTE);
    if (layer !== null && LAYERS.has(layer)) foreignObject.setAttribute(LAYER_ATTRIBUTE, layer);

    foreignObject.append(slide);
    svg.append(foreignObject);
  }

  return svg.childElementCount > 0 ? svg : null;
}

/**
 * `style` 属性の `url()` を許可リストで検証する。
 *
 * 背景画像はディレクティブから `style` の `url()` として出力され、`<img>` の検証と解決を通らない。
 * 許可されないものは `none` に置き換える。
 * 相対パスはここでは残し、`resolveBackgrounds` が `resolveAsset` で解決する。
 */
function checkStyleUrls(root: HTMLElement): void {
  for (const element of [root, ...root.querySelectorAll<HTMLElement>('[style]')]) {
    const { style } = element;
    for (const property of style) {
      const value = style.getPropertyValue(property);
      if (!value.includes('url(')) continue;
      const checked = value.replaceAll(CSS_URL, (whole, raw: string) =>
        isAllowedUri(unescapeCss(raw)) ? whole : 'none',
      );
      if (checked !== value) style.setProperty(property, checked, style.getPropertyPriority(property));
    }
    // NOTE: 解釈できない宣言は CSSOM に現れず、属性の文字列にだけ残る。検証した結果で属性を書き直し、検証していない文字列を残さない。
    if (/url\(/i.test(element.getAttribute('style') ?? '')) element.setAttribute('style', style.cssText);
  }
}

/**
 * 相対パスの背景画像を `asset:` の URL へ解決する（`preview/enhance.ts` の画像と同じ経路）。
 *
 * スコープ外と存在しないものは `none` に置き換える。
 * `<img>` と違ってプレースホルダを置く場所が無いため、許可ボタンは出さない。
 */
async function resolveBackgrounds(deck: HTMLElement, baseDir: string): Promise<void> {
  const targets = [...deck.querySelectorAll<HTMLElement>('[style*="url("]')];
  await Promise.all(
    targets.map(async (element) => {
      const { style } = element;
      for (const property of style) {
        const value = style.getPropertyValue(property);
        const hrefs = Array.from(value.matchAll(CSS_URL), (match) => unescapeCss(match[1] ?? ''));
        const local = hrefs.filter((href) => !READY.test(href));
        if (local.length === 0) continue;

        const urls = new Map(
          // eslint-disable-next-line no-await-in-loop -- url() を持つ性質は 1 要素に通常 1 つだけである
          await Promise.all(local.map(async (href) => [href, await resolve(href, baseDir)] as const)),
        );
        if (!element.isConnected) return;

        const next = value.replaceAll(CSS_URL, (whole, raw: string) => {
          const href = unescapeCss(raw);
          if (!urls.has(href)) return whole;
          const url = urls.get(href);
          return url ? `url(${JSON.stringify(url)})` : 'none';
        });
        style.setProperty(property, next, style.getPropertyPriority(property));
      }
    }),
  );
}

function resolve(href: string, baseDir: string): Promise<string | null> {
  if (baseDir === '') return Promise.resolve(null);
  const key = `${baseDir}\n${href}`;
  let pending = resolved.get(key);
  if (!pending) {
    pending = resolveAsset(href, baseDir);
    resolved.set(key, pending);
  }
  return pending;
}

async function resolveAsset(href: string, baseDir: string): Promise<string | null> {
  try {
    return await getPlatform().resolveAsset(href, baseDir);
  } catch {
    // 許可ディレクトリの外にあるか、ファイルが存在しない。
    return null;
  }
}

/** CSSOM が付けたエスケープを外す。 */
function unescapeCss(raw: string): string {
  return raw.replaceAll(/\\(.)/g, '$1');
}

/**
 * テーマの CSS を `#mx-preview { … }` の入れ子にする。
 *
 * 生成された規則がその 1 つに収まっていれば入れ子の文字列を、外へ出ていれば `null` を返す。
 * `@import`（gaia / uncover の Web フォント）と `@charset` は入れ子の中では無効になり、読み込まれない。
 */
function nest(css: string): string | null {
  if (nested?.css === css) return nested.result;

  const wrapped = `${SCOPE} {\n${css}\n}\n`;
  const probe = document.createElement('style');
  probe.textContent = wrapped;
  document.head.append(probe);
  let result: string | null = null;
  try {
    const rules = probe.sheet?.cssRules;
    const rule = rules?.[0];
    if (rules?.length === 1 && rule instanceof CSSStyleRule && rule.selectorText === SCOPE) result = wrapped;
  } catch {
    result = null;
  } finally {
    probe.remove();
  }

  nested = { css, result };
  return result;
}
