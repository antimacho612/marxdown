/**
 * DOMPurify の設定（02.architecture/09-security.md §1 Layer 3 / ADR-0006）。
 *
 * 中心ユースケースは「LLM が生成した、自分が書いていないファイルを開く」ことであり、開いた時点で何かが実行される経路をすべて塞ぐ。
 *
 * このモジュールは DOM を必要とするため、メインスレッドでのみ動作する。
 * クリティカルパスから外せるかどうかは OQ-10 で扱う。
 */
import DOMPurify, { type Config } from 'dompurify';

import { formatSrcset, parseSrcset } from '@/lib/srcset';

/**
 * スキーム付き URI かどうかの判定と、許可するスキーム。
 *
 * リンクの実際の分岐は JS 側で行う（02.architecture/09-security.md §2）。
 * ここは未知のスキームを属性ごと除去するだけである。
 * `./a.png` のような形ではなくスキームの有無で判定するのは、`img/a.png` のような接頭辞の無い相対パス（最も普通の書き方）を除去しないためである。
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

  // data: は画像だけ通す（data:text/html が最大の攻撃経路）
  if (scheme === 'data') return /^data:image\/(png|jpe?g|gif|webp|avif|svg\+xml);/i.test(trimmed);

  return ALLOWED_SCHEMES.has(scheme);
}

/**
 * `srcset` の候補（WHATWG の srcset 構文）を 1 つずつ `isAllowedUri` で検証する。
 *
 * `<picture><source srcset>` はダークモード用画像の出し分けなどで使われる普通の記法だが、値が URL 1 個ではなく `URL 記述子, URL 記述子, ...` のリストであるため、href/src と同じ 1 属性 1 URL の検証には乗らない。
 * 候補単位でパースしてから検証する。
 */
function filterSrcset(value: string): string {
  return formatSrcset(parseSrcset(value).filter((candidate) => isAllowedUri(candidate.url)));
}

let configured = false;

function configure(): void {
  if (configured) return;
  configured = true;

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

    // srcset は候補単位で検証する。1 つも残らなければ href/src と同じく除去して痕跡を残す。
    const srcset = node.getAttribute('srcset');
    if (srcset !== null) {
      const filtered = filterSrcset(srcset);
      if (filtered === '') {
        node.removeAttribute('srcset');
        node.setAttribute('data-mx-blocked', 'srcset');
      } else if (filtered !== srcset) {
        node.setAttribute('srcset', filtered);
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
  // `input` にも例外を設けない。タスクリストのチェックボックス（F-VIEW-01）は `<input>` ではなく `<span role="checkbox">` で出力する（`markdown/plugins/task-list.ts`）。
  // 生 HTML を書いたドキュメントが操作可能なフォーム部品を本文へ持ち込む経路は、これで閉じている。
  //
  // `style` は落とさない。Marp 用のスライド装飾など、埋め込む正当な用途があるためである（issue #161）。
  // 素通しはせず、`scopeStyles` がプレビューの外へ及ばないよう包む。
  FORBID_TAGS: [
    'script',
    'iframe',
    'object',
    'embed',
    'form',
    'input',
    'button',
    'textarea',
    'select',
    'base',
    'meta',
    'link',
  ],
  // srcset は一律禁止ではなく、フック側で候補単位に検証する。
  FORBID_ATTR: ['style', 'formaction', 'ping'],
  // on* 属性は DOMPurify が既定で除去するが、意図を明示するために記載する
  ALLOW_DATA_ATTR: true, // data-line が必要（02.architecture/06-markdown-rendering-pipeline.md §3）
  ALLOW_ARIA_ATTR: true,
  // SVG は GitHub Alerts のアイコンと Mermaid が生成したものを通す必要がある
  USE_PROFILES: { html: true, svg: true, svgFilters: true },
  KEEP_CONTENT: true,
  // `<style>` が本文の先頭に来ると、DOMParser によるフルドキュメント解析で `<head>` 側へ回されて消える（HTML5 のツリー構築アルゴリズムの仕様）。
  // 本文の外へ流出こそしないが、位置によって効いたり消えたりするのは Marp 用途として使いものにならない。
  // ダミー要素を先頭に足して常に「本文の中」から解析させることで、位置に依存しない挙動にする。
  FORCE_BODY: true,
};

/**
 * プレビューの外へ CSS を漏らさないためのスコープ選択子。
 *
 * `#mx-preview`（`index.html` / `paint.ts` の描画先）と一致させる。共有定数が無いのは、
 * 他の参照箇所（`features/theme/inject.ts` など）も同様に文字列リテラルで持っているためである。
 */
const PREVIEW_SELECTOR = '#mx-preview';

/**
 * サニタイズ済み HTML 中の `<style>` の中身を、プレビューの外へ及ばないよう `@scope` で閉じ込める（issue #161）。
 *
 * CSS はカスケードに DOM 上の位置を問わないため、`<style>` タグを許可リストで素通しするだけでは
 * 本文の外（アプリ全体）にも規則が効いてしまう。`@scope (#mx-preview)` で包み、
 * `02.architecture/10-theming.md §3.4`（`features/theme/inject.ts`）と同じ「ブラウザに解釈させた結果だけを見る」手法で、
 * 波かっこの数を細工して範囲外へ出ようとしたものを丸ごと落とす（`confine`）。
 */
function scopeStyles(html: string): string {
  if (!html.includes('<style')) return html; // 大半の文書はここで終わる

  const template = document.createElement('template');
  template.innerHTML = html;

  const styles = template.content.querySelectorAll('style');
  if (styles.length === 0) return html;

  for (const style of styles) {
    const scoped = confine(style.textContent ?? '');
    if (scoped === null) {
      // 範囲外に出るものは残さない。部分的に適用された状態にすると、どこまでが効いているのか画面から読み取れない。
      style.remove();
    } else {
      style.textContent = scoped;
    }
  }

  // eslint-disable-next-line unicorn/prefer-dom-node-html-methods -- getHTML() は本稿執筆時点で jsdom が未実装で、dom.test.ts が動かなくなる
  return template.innerHTML;
}

/**
 * `css` を `@scope` で包み、生成された規則がその 1 つに収まっているかを検証する。
 *
 * 収まっていれば包んだ文字列を、波かっこの余分な閉じなどで範囲外に出ていれば `null` を返す。
 * 字句解析で波かっこを数えようとすると CSS のパーサを再実装することになるため、
 * 実際に `<style>` へ入れてブラウザに解釈させ、`CSSOM` 上の規則数と種類だけを見る。
 */
function confine(css: string): string | null {
  const wrapped = `@scope (${PREVIEW_SELECTOR}) {\n${css}\n}`;

  const probe = document.createElement('style');
  probe.textContent = wrapped;
  document.head.append(probe);
  try {
    const rules = probe.sheet?.cssRules;
    if (!rules || rules.length !== 1) return null;

    const rule = rules[0];
    return rule instanceof CSSScopeRule && rule.start === PREVIEW_SELECTOR ? wrapped : null;
  } catch {
    return null;
  } finally {
    probe.remove();
  }
}

/** パイプラインが生成した HTML 文字列をサニタイズする。DOM に入る HTML は必ずここを通す。 */
export function sanitize(html: string): string {
  configure();
  return scopeStyles(DOMPurify.sanitize(html, CONFIG));
}

/**
 * Mermaid が生成した SVG も同じサニタイザを通す（F-VIEW-12 / §1 Layer 3）。
 *
 * 本文用の設定から変えるのは `style` 属性だけである。理由は `sanitizeMath` と同じ形で、Mermaid は図形の位置と大きさをインラインの `style` で表現しており、除去すると図が崩れる。
 * 値を組み立てるのは Mermaid であってドキュメントではない。
 *
 * `foreignObject` は通さない（DOMPurify の既定のまま）。
 * mXSS の経路として知られており、許可すると SVG の内側に HTML の名前空間が入る。
 * Mermaid は既定でノードのラベルをそこに置くため、そのままではラベルが無い図になる。
 * サニタイザを広げる側では直さず、Mermaid 側で `htmlLabels: false` にしてラベルを SVG の `<text>` として出力させている（`features/preview/lazy/mermaid.ts`）。
 */
export function sanitizeSvg(svg: string): string {
  configure();
  return DOMPurify.sanitize(svg, {
    ...CONFIG,
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_ATTR: ['formaction', 'ping'],
  });
}

/**
 * KaTeX が生成した HTML をサニタイズする（F-VIEW-13 / §1 Layer 3）。
 *
 * 本文用の設定と 2 点だけ違う。
 *
 * MathML を通す。KaTeX の既定出力は視覚表現の HTML と、支援技術が読む MathML の 2 本立てであり、`mathMl` プロファイルが無いと後者が丸ごと除去されてスクリーンリーダーから数式が消える。
 *
 * `style` 属性を通す。KaTeX は文字の高さと位置を全部インラインの `style` で表現しており、除去すると数式の縦方向の配置が崩れて読めなくなる。
 * 値を組み立てるのは KaTeX であってドキュメントではない。
 * ドキュメント側から `style` を書ける記法（`\htmlStyle` など）は `trust: false` で無効化してある（`features/preview/lazy/math.ts`）。
 */
export function sanitizeMath(html: string): string {
  configure();
  return DOMPurify.sanitize(html, {
    ...CONFIG,
    USE_PROFILES: { html: true, mathMl: true, svg: true, svgFilters: true },
    FORBID_ATTR: ['formaction', 'ping'],
  });
}
