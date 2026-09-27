/**
 * 1 ファイルで完結する HTML を組み立てる（F-VIEW-18）。
 *
 * 見た目は画面と同じにする（docs/06.roadmap/m7-cli-os-export.md §4.4）。
 * スクリプトは含めず、CSP でスクリプトと外部への読み込み（画像を除く）を禁じる。
 */
import { getPlatform } from '@/platform';

import { collectCss } from './css';

/** 書き出した HTML に付ける CSP。外部の画像だけは参照のまま残すため許可する。 */
const CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data: https:; font-src data:";

/** asset URL（`resolveAsset` が返した URL）か。 */
const ASSET = /^(?:asset:|https?:\/\/asset\.localhost\/)/i;

/**
 * 単体のページとして読めるようにする上書き。
 *
 * 画面では面の内側がスクロールするため、高さとスクロールの制約を外す。
 * 表示倍率（`--mx-zoom`）は画面の一時的な状態であり、書き出したものには持ち込まない。
 */
const STANDALONE_CSS = `
html, body { margin: 0; height: auto; overflow: visible; }
.mx-preview { --mx-zoom: 1; height: auto; overflow: visible; padding-block-end: var(--mx-space-10); }
`;

/** `buildHtml` の入力。 */
export interface HtmlInput {
  /** 描いた本文（`render.ts` の戻り値）。この関数の中で画像を data URI に置き換える。 */
  body: HTMLElement;
  /** 画面の `#mx-preview`。属性（配色・表の見た目・倍率）を写す。 */
  surface: HTMLElement;
  title: string;
}

/** HTML 文書の文字列を返す。 */
export async function buildHtml(input: HtmlInput): Promise<string> {
  await inlineImages(input.body);
  const css = await collectCss(input.body.querySelector('.katex') !== null);

  const doc = document.implementation.createHTMLDocument(input.title);
  const root = doc.documentElement;
  root.lang = 'ja';
  // テーマ（`data-theme`）と、設定がトークンを上書きしているインラインスタイルを写す。
  for (const name of ['data-theme', 'style']) {
    const value = document.documentElement.getAttribute(name);
    if (value !== null) root.setAttribute(name, value);
  }

  const head = doc.head;
  // eslint-disable-next-line unicorn/text-encoding-identifier-case -- HTML の文字コード宣言の表記であって、識別子ではない
  head.prepend(meta(doc, { charset: 'utf-8' }));
  head.append(meta(doc, { name: 'viewport', content: 'width=device-width, initial-scale=1' }));
  head.append(meta(doc, { 'http-equiv': 'Content-Security-Policy', content: CSP }));
  head.append(meta(doc, { name: 'generator', content: 'Marxdown' }));
  const style = doc.createElement('style');
  // 面の外側（body）は面と同じ色で塗る。配色は面にだけ適用されるため、トークンからは求められない。
  style.textContent = `${css}\n${STANDALONE_CSS}\nbody { background: ${getComputedStyle(input.surface).backgroundColor}; }\n`;
  head.append(style);

  const main = doc.createElement('main');
  for (const attribute of input.surface.attributes) main.setAttribute(attribute.name, attribute.value);
  main.append(...[...input.body.childNodes].map((node) => doc.importNode(node, true)));
  doc.body.append(main);

  return `<!doctype html>\n${root.outerHTML}\n`;
}

function meta(doc: Document, attributes: Record<string, string>): HTMLMetaElement {
  const element = doc.createElement('meta');
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  return element;
}

/** ローカル画像を data URI にする。読めなかったものは代替テキストに置き換える。 */
async function inlineImages(body: HTMLElement): Promise<void> {
  const platform = getPlatform();
  const local = [...body.querySelectorAll<HTMLImageElement>('img[src]')].filter((img) =>
    ASSET.test(img.getAttribute('src') ?? ''),
  );
  await Promise.all(
    local.map(async (img) => {
      try {
        img.src = await platform.inlineImage(img.getAttribute('src') ?? '');
      } catch {
        img.replaceWith(document.createTextNode(img.alt));
      }
    }),
  );
}
