/**
 * PDF の書き出し（F-VIEW-18）。
 *
 * 描いた本文を印刷専用の要素に入れてウィンドウに置き、`@media print` でそれ以外を隠してから WebView2 の `PrintToPdf` を呼ぶ。
 * 画面の `#mx-preview` は使わない。印刷のあいだも画面の見た目を変えないためである。
 * 配色は常に明るい既定配色にする（docs/06.roadmap/m8-cli-os-export.md §4.4）。
 */
import { getPlatform, type CoreError } from '@/platform';

import { lightTokens } from './css';

const HOST_ID = 'mx-print';

/**
 * 印刷のあいだだけ置く規則。
 *
 * 画面の `body` は grid で、面の内側がスクロールする。そのままでは 1 ページ目で切れる。
 * 画像・図・数式はページをまたぐと読めないため分割させない。コードブロックと表は長くなりうるため分割を許す。
 */
const PRINT_CSS = `
@media screen {
  #${HOST_ID} { display: none !important; }
}
@media print {
  html, body { display: block !important; height: auto !important; overflow: visible !important; background: var(--mx-color-bg) !important; }
  body > :not(#${HOST_ID}) { display: none !important; }
  #${HOST_ID} { height: auto; overflow: visible; padding: 0; }
  #${HOST_ID} :is(img, svg, .mx-math) { break-inside: avoid; }
  #${HOST_ID} :is(h1, h2, h3, h4, h5, h6) { break-after: avoid; }
}
`;

/**
 * 描いた本文を PDF に書き出す。保存先のパスを返し、取り消されたら `null`。
 *
 * `body` の子は印刷用の要素へ移される。
 * WebView2 が無い環境（Windows 以外 / dev:web）では印刷ダイアログを出し、`null` を返す。
 */
export async function printToPdf(
  body: HTMLElement,
  surface: HTMLElement,
  suggested: string | null,
): Promise<string | null> {
  const host = document.createElement('div');
  host.id = HOST_ID;
  // 表の見た目などの属性は写す。配色（`data-mx-theme`）と倍率は写さない。
  for (const attribute of surface.attributes) {
    if (attribute.name === 'id' || attribute.name === 'style' || attribute.name === 'data-mx-theme') continue;
    host.setAttribute(attribute.name, attribute.value);
  }
  for (const [name, value] of lightTokens()) host.style.setProperty(name, value);
  host.style.setProperty('--mx-zoom', '1');
  host.append(...body.childNodes);

  const style = document.createElement('style');
  style.textContent = PRINT_CSS;
  document.head.append(style);
  document.body.append(host);

  try {
    // 読み込み途中の画像は空白で印刷される。
    await Promise.all([...host.querySelectorAll('img')].map((img) => settle(img)));
    try {
      return await getPlatform().exportPdf(suggested);
    } catch (e) {
      if (!isUnsupported(e)) throw e;
      globalThis.print();
      return null;
    }
  } finally {
    host.remove();
    style.remove();
  }
}

/** 画像の読み込みを待つ。読めない画像は代替表示のまま印刷されるだけなので、失敗は無視する。 */
async function settle(img: HTMLImageElement): Promise<void> {
  try {
    await img.decode();
  } catch {
    // 上記のとおり無視する。
  }
}

function isUnsupported(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as Partial<CoreError>).kind === 'invalid-argument';
}
