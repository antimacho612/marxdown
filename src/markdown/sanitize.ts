/**
 * DOMPurify の設定（02.architecture/09-security.md §1 Layer 3 / ADR-0006）。
 *
 * 中心ユースケースは「LLM が生成した、自分が書いていないファイルを開く」こと。
 * 開いた瞬間に何かが実行される経路を全部塞ぐ。
 *
 * このモジュールは **DOM を必要とする**ため Worker では動かない。
 * メインスレッド固定。クリティカルパスから外せるかは OQ-10。
 */
import DOMPurify, { type Config } from 'dompurify';

/**
 * スキーム付き URI かどうかの判定と、許可するスキーム。
 *
 * リンクの実際の分岐は JS 側で行う（02.architecture/09-security.md §2）。ここでは
 * 「未知のスキームを属性ごと落とす」だけを担当する。
 *
 * # 形ではなくスキームで判定する理由
 *
 * `./a.png` `../a.png` のような形を許可リストにすると、
 * `img/a.png` や `a.png` のような**接頭辞の無い相対パス**が漏れる。
 * これは Markdown で最も普通の書き方であり、落としてはいけない。
 *
 * よって「スキームが有るか」を先に判定し、無ければ相対パスとして通す。
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
 * `markdown-it-task-lists` が出すのは `<input class="..." disabled type="checkbox">` の 1 形だけ。
 * **それ以外の `<input>` は本文の中に居てよい理由が無い**ので落とす。
 *
 * `disabled` を必須にしているのは、プレビュー上でチェックを許すか（OQ-05）が
 * まだ決まっていないため。決まる前に、生 HTML を書いたドキュメントが
 * 操作可能なチェックボックスを本文へ持ち込めてしまう状態を作らない。
 */
function isTaskListCheckbox(node: Element): boolean {
  if (node.tagName !== 'INPUT') return true;
  return node.getAttribute('type')?.toLowerCase() === 'checkbox' && node.hasAttribute('disabled');
}

let configured = false;

function configure(): void {
  if (configured) return;
  configured = true;

  // `input` は許可タグに戻してあるが、通ってよいのは上の 1 形だけ。
  // **タグの許可と、その中の絞り込みを別の場所に置かない**ため、ここで一緒に落とす。
  DOMPurify.addHook('uponSanitizeElement', (node) => {
    if (!(node instanceof Element)) return;
    if (!isTaskListCheckbox(node)) node.remove();
  });

  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (!(node instanceof Element)) return;

    // href / src の許可リスト検証。未知のスキームは属性ごと落とす。
    //
    // DOMPurify 自身も javascript: / vbscript: を落とすが、それは
    // DOMPurify の許可リストであってこちらの許可リストではない。
    // 二重に見ることで、DOMPurify の既定が緩んだときの影響を受けない。
    for (const attr of ['href', 'src'] as const) {
      const value = node.getAttribute(attr);
      if (value === null) continue;
      if (!isAllowedUri(value)) {
        node.removeAttribute(attr);
        node.setAttribute('data-mx-blocked', attr);
      }
    }

    // 外部リンクは新規ウィンドウ扱いにしない（ナビゲーションは全面禁止）。
    // クリックは JS が捕捉して `open_external` に流す。
    if (node.tagName === 'A' && node.hasAttribute('href')) {
      node.setAttribute('rel', 'noopener noreferrer');
      node.removeAttribute('target');
    }
  });
}

const CONFIG: Config = {
  // script / iframe / object / embed / form を除去（§1 Layer 3）
  //
  // `button` 以降は仕様が要求していない上積みで、「本文に操作可能な部品を置かない」
  // ための保険である。**`input` だけはここから外してある。** タスクリストの
  // チェックボックス（F-VIEW-01）が唯一の例外で、絞り込みは `isTaskListCheckbox`
  // が `uponSanitizeElement` で行う。`form` を落としているので、生き残った
  // チェックボックスに送信先は無い。
  FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'button', 'textarea', 'select', 'base', 'meta', 'link'],
  FORBID_ATTR: ['style', 'srcset', 'formaction', 'ping'],
  // on* 属性は DOMPurify が既定で落とすが、明示しておく
  ALLOW_DATA_ATTR: true, // data-line が必要（02.architecture/06-markdown-rendering-pipeline.md §3）
  ALLOW_ARIA_ATTR: true,
  // SVG は Mermaid が生成したものを通す必要がある（M4）
  USE_PROFILES: { html: true, svg: true, svgFilters: true },
  KEEP_CONTENT: true,
};

/** Worker が生成した HTML 文字列をサニタイズする。 */
export function sanitize(html: string): string {
  configure();
  return DOMPurify.sanitize(html, CONFIG);
}

/**
 * Mermaid が生成した SVG も**同じサニタイザ**を通す（§1 Layer 3）。
 * 使うのは Mermaid が入る M4 だが、ここに置いておくのは
 * **DOM に入る HTML の経路を 2 つに分岐させない**ため。
 */
export function sanitizeSvg(svg: string): string {
  configure();
  return DOMPurify.sanitize(svg, { ...CONFIG, USE_PROFILES: { svg: true, svgFilters: true } });
}
