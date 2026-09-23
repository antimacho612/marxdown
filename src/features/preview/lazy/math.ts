/**
 * 数式の描画（F-VIEW-13）。
 *
 * 遅延チャンク `math` の入口。
 * 数式を含む文書を描画したときにだけロードされるため、`preview` から静的に import してはいけない。
 * KaTeX は約 74KB（gzip）あり、critical path の予算に収まらない（02.architecture/05-startup-sequence.md §3 の分割境界）。
 *
 * CSS とフォントもこのチャンクに含まれる。
 * `katex.min.css` の `@font-face` は woff2 / woff / ttf の 3 形式を参照するが、ビルド時に woff2 だけへ削っている（`vite.config.ts`）。
 */
import { renderToString } from 'katex';

import { sanitizeMath } from '@/markdown/sanitize';

import 'katex/dist/katex.min.css';
import '@/styles/preview/math.css';

/**
 * KaTeX のオプション。
 *
 * 中心ユースケースは「LLM が生成した、自分が書いていないファイルを開く」ことである（ADR-0006）。
 * したがって既定値のうち、入力が計算量やドキュメントの外へ影響できる 3 つを制限してある。
 *
 * `trust: false` は `\href` / `\includegraphics` / `\htmlStyle` などを無効にする。
 * これが有効だと、数式からリンクと `style` を本文へ持ち込めてしまう（`sanitizeMath` が `style` を通していることと対になっている）。
 *
 * `maxSize` は `\rule{9999em}{9999em}` のような指定が実際の描画サイズになるのを防ぐ。
 * `maxExpand` はマクロの再帰展開の上限で、既定のままだと `\def` を使った展開の連鎖に時間を取られる。
 */
const OPTIONS = {
  throwOnError: false,
  trust: false,
  strict: 'ignore',
  maxSize: 100,
  maxExpand: 1000,
} as const;

/**
 * プレースホルダ 1 つを数式へ置き換える。
 *
 * 要素のテキストが元の TeX である（`markdown/plugins/math.ts`）。
 * 失敗したときは何もしない。その TeX が読める状態で残るほうが、空欄になるより情報が多い（N-REL-04）。
 */
export function renderMath(element: HTMLElement): void {
  const source = element.textContent ?? '';
  if (source === '') return;

  try {
    const html = renderToString(source, {
      ...OPTIONS,
      displayMode: element.dataset['mxMath'] !== 'inline',
    });
    // KaTeX の出力は数式からのみ生成されるが、`innerHTML` に渡す HTML 文字列であることに変わりはない。
    // ADR-0006 の「DOM に入る HTML は必ず Layer 3 を通る」を例外なく適用する（Mermaid の SVG と同じ理由）。
    element.innerHTML = sanitizeMath(html);
    element.dataset['mxMathRendered'] = '';
  } catch {
    // `throwOnError: false` は構文の誤りを赤字で描くため、ここへ来るのは KaTeX 自体が想定しなかった入力である。
    // 通知バーに出すほどの内容ではない。TeX がそのまま残る。
  }
}
