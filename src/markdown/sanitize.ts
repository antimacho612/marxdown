/**
 * DOMPurify の設定（02.architecture/09-security.md §1 Layer 3 / ADR-0006）。
 *
 * 中心ユースケースは「LLM が生成した、自分が書いていないファイルを開く」ことであり、開いた時点で何かが実行される経路をすべて塞ぐ。
 *
 * このモジュールは DOM を必要とするため、メインスレッドでのみ動作する。
 * クリティカルパスから外せるかどうかは OQ-10 で扱う。
 */
import DOMPurify, { type Config } from 'dompurify';

/**
 * スキーム付き URI かどうかの判定と、許可するスキーム。
 *
 * リンクの実際の分岐は JS 側で行う（02.architecture/09-security.md §2）。
 * ここは未知のスキームを属性ごと落とすだけである。
 * `./a.png` のような形ではなくスキームの有無で判定するのは、`img/a.png` のような接頭辞の無い相対パス（最も普通の書き方）を落とさないためである。
 */
const SCHEME = /^([a-z][a-z0-9+.-]*):/i;

const ALLOWED_SCHEMES = new Set(['http', 'https', 'mailto', 'tel', 'asset', 'blob']);

function isAllowedUri(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === '') return true;
  if (trimmed.startsWith('#')) return true; // ページ内アンカー

  const match = SCHEME.exec(trimmed);
  if (!match?.[1]) return true; // スキーム無し = 相対パス

  const scheme = match[1].toLowerCase();

  // Windows のドライブレター（C:\... / C:/...）はスキームに見えるが相対でない絶対パス
  if (scheme.length === 1 && /^[a-z]:[\\/]/i.test(trimmed)) return true;

  // data: は画像だけ通す（data:text/html が最大の抜け道）
  if (scheme === 'data') return /^data:image\/(png|jpe?g|gif|webp|avif|svg\+xml);/i.test(trimmed);

  return ALLOWED_SCHEMES.has(scheme);
}

/**
 * 生き残ってよい `<input>` か（タスクリストのチェックボックスだけ / F-VIEW-01）。
 *
 * `markdown-it-task-lists` が出力するのは `<input class="..." disabled type="checkbox">` の 1 種類だけである。
 * それ以外の `<input>` を本文に含める理由が無いため除去する。
 *
 * `disabled` を必須にしているのは、プレビュー上でチェックを許可するかどうか（OQ-05）が未決だからである。
 * 決定する前に、生 HTML を書いたドキュメントが操作可能なチェックボックスを本文へ持ち込める状態を作らない。
 */
function isTaskListCheckbox(node: Element): boolean {
  if (node.tagName !== 'INPUT') return true;
  return node.getAttribute('type')?.toLowerCase() === 'checkbox' && node.hasAttribute('disabled');
}

let configured = false;

function configure(): void {
  if (configured) return;
  configured = true;

  // `input` は許可タグに含めているが、通過してよいのは上の 1 種類だけである。
  // タグの許可とその絞り込みを別の場所に分散させないため、ここで併せて除去する。
  DOMPurify.addHook('uponSanitizeElement', (node) => {
    if (!(node instanceof Element)) return;
    if (!isTaskListCheckbox(node)) node.remove();
  });

  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (!(node instanceof Element)) return;

    // href / src の許可リスト検証。未知のスキームは属性ごと除去する。
    //
    // DOMPurify 自身も javascript: / vbscript: を除去するが、それは DOMPurify の許可リストであって、こちらの許可リストではない。
    // 二重に判定することで、DOMPurify の既定が変わった場合の影響を受けない。
    for (const attr of ['href', 'src'] as const) {
      const value = node.getAttribute(attr);
      if (value === null) continue;
      if (!isAllowedUri(value)) {
        node.removeAttribute(attr);
        node.setAttribute('data-mx-blocked', attr);
      }
    }

    // 外部リンクを新規ウィンドウ扱いにしない（ナビゲーションは全面的に禁止している）。
    // クリックは JS 側で捕捉し、`open_external` へ渡す。
    if (node.tagName === 'A' && node.hasAttribute('href')) {
      node.setAttribute('rel', 'noopener noreferrer');
      node.removeAttribute('target');
    }
  });
}

const CONFIG: Config = {
  // script / iframe / object / embed / form を除去（§1 Layer 3）
  //
  // `button` 以降は仕様が要求していない追加分であり、本文に操作可能な部品を置かないための措置である。
  // `input` だけはこの一覧から外してある。
  // タスクリストのチェックボックス（F-VIEW-01）が唯一の例外で、絞り込みは `isTaskListCheckbox` が `uponSanitizeElement` で行う。
  // `form` を除去しているため、残ったチェックボックスに送信先は存在しない。
  FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'button', 'textarea', 'select', 'base', 'meta', 'link'],
  FORBID_ATTR: ['style', 'srcset', 'formaction', 'ping'],
  // on* 属性は DOMPurify が既定で除去するが、意図を明示するために記載する
  ALLOW_DATA_ATTR: true, // data-line が必要（02.architecture/06-markdown-rendering-pipeline.md §3）
  ALLOW_ARIA_ATTR: true,
  // SVG は Mermaid が生成したものを通す必要がある（M4）
  USE_PROFILES: { html: true, svg: true, svgFilters: true },
  KEEP_CONTENT: true,
};

/** パイプラインが生成した HTML 文字列をサニタイズする。DOM に入る HTML は必ずここを通す。 */
export function sanitize(html: string): string {
  configure();
  return DOMPurify.sanitize(html, CONFIG);
}

/**
 * Mermaid が生成した SVG も同じサニタイザを通す（F-VIEW-12 / §1 Layer 3）。
 *
 * 本文用の設定から変えるのは `style` 属性だけである。理由は `sanitizeMath` と同じ形で、
 * Mermaid は図形の位置と大きさをインラインの `style` で表現しており、除去すると図が崩れる。
 * 値を組み立てるのは Mermaid であってドキュメントではない。
 *
 * **`foreignObject` は通さない**（DOMPurify の既定のまま）。
 * mXSS の経路として知られており、許可すると SVG の内側に HTML の名前空間が入る。
 * Mermaid は既定でノードのラベルをそこに置くため、そのままでは**ラベルが消えた図**になる。
 * サニタイザを広げる側では直さず、Mermaid 側で `htmlLabels: false` にして
 * ラベルを SVG の `<text>` として出力させている（`features/preview/lazy/mermaid.ts`）。
 */
export function sanitizeSvg(svg: string): string {
  configure();
  return DOMPurify.sanitize(svg, {
    ...CONFIG,
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_ATTR: ['srcset', 'formaction', 'ping'],
  });
}

/**
 * KaTeX が生成した HTML をサニタイズする（F-VIEW-13 / §1 Layer 3）。
 *
 * 本文用の設定と 2 点だけ違う。
 *
 * MathML を通す。KaTeX の既定出力は視覚表現の HTML と、支援技術が読む MathML の 2 本立てであり、
 * `mathMl` プロファイルが無いと後者が丸ごと落ちてスクリーンリーダーから数式が消える。
 *
 * `style` 属性を通す。KaTeX は文字の高さと位置を全部インラインの `style` で表現しており、除去すると数式が縦に潰れて読めなくなる。
 * 値を組み立てるのは KaTeX であってドキュメントではない。
 * ドキュメント側から `style` を書ける記法（`\htmlStyle` など）は `trust: false` で無効化してある（`features/preview/lazy/math.ts`）。
 */
export function sanitizeMath(html: string): string {
  configure();
  return DOMPurify.sanitize(html, {
    ...CONFIG,
    USE_PROFILES: { html: true, mathMl: true, svg: true, svgFilters: true },
    FORBID_ATTR: ['srcset', 'formaction', 'ping'],
  });
}
