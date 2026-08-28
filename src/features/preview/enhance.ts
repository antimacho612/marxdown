/**
 * 描画済みの本文に後から手を入れる工程（F-VIEW-03, 04, 08）。
 *
 * ```text
 * paint()  →  本文が読める（T8）
 *              ↓ ここから先はアイドル時間の仕事
 *          enhance()  →  画像の解決 / コピーボタン / シンタックスハイライト
 * ```
 *
 * # なぜ描画の後なのか
 *
 * どれも**読み始めるのに要らない**。画像の解決は IPC を伴い、ハイライトは
 * 別チャンクのロードを伴う。これらを T8 の手前に置くと、
 * 「本文が読める」までの時間がそのぶん伸びる（05.performance-budget/04-targets.md §1）。
 *
 * # 段階的描画との噛み合わせ
 *
 * `paint()` は最初のチャンクだけ同期で入れ、残りをアイドルで足す。
 * よって `enhance()` は **2 回呼ばれる**（最初のチャンクの直後と、全チャンク投入後）。
 * 処理済みの要素には印を付けて、2 回目は新しく増えたぶんだけを見る。
 * MutationObserver を常駐させないのは、アイドル時の監視を増やさないため。
 */
import { ja } from '@/i18n/ja';
import { processInIdle } from '@/lib/idle';
import { getPlatform } from '@/platform';

/** 処理済みの印。2 回目の `enhance` がここを見て取りこぼしだけ拾う。 */
const DONE = 'mxEnhanced';

export interface EnhanceOptions {
  /** 相対パスの画像を解決する基準。開いているファイルの親ディレクトリ。 */
  baseDir: string;
}

/**
 * 未処理の要素を拾って手を入れる。
 *
 * 3 つの仕事は互いに独立なので、それぞれ別のアイドル列に流す。
 * 画像 1 枚の解決が遅いせいでコピーボタンが出ない、という結合を作らない。
 */
export function enhance(container: HTMLElement, options: EnhanceOptions): void {
  void enhanceCodeBlocks(container);
  void enhanceImages(container, options.baseDir);
}

/* ------------------------------------------------------------------ */
/* コードブロック（F-VIEW-03 / F-VIEW-04）                              */
/* ------------------------------------------------------------------ */

async function enhanceCodeBlocks(container: HTMLElement): Promise<void> {
  const blocks = [...container.querySelectorAll<HTMLElement>('pre > code')].filter(
    (code) => !(DONE in (code.parentElement?.dataset ?? {})),
  );
  if (blocks.length === 0) return;

  for (const code of blocks) {
    const pre = code.parentElement;
    if (pre) {
      pre.dataset[DONE] = '';
      addCopyButton(pre, code);
    }
  }

  // ハイライトは**遅延チャンク**。コードブロックが 1 つも無いドキュメントでは
  // ここに到達しないので、`highlight` チャンクはロードすらされない
  // （02.architecture/05-startup-sequence.md §3 の分割境界）。
  const { highlightElement, languageOf } = await import('./highlight');
  const targets = blocks.filter((code) => languageOf(code) !== null);

  await processInIdle(targets, (code) => {
    // **切り離された要素は飛ばす**（OQ-18）。
    //
    // `enhance` はアイドルで少しずつ進むので、この途中で次のファイルが開かれると
    // 対象は `paint()` の `replaceChildren()` によって DOM から外れている。
    // ハイライトは 1 ブロックあたり数百 µs かかる仕事で、それを
    // **もう誰も見ていない要素に対して**最後までやり切る理由がない。
    //
    // `paint` 側の打ち切り（`cancelPaint`）と役割が違う。あちらは
    // 「作り続けるのを止める」、こちらは「作り終えたものを整えるのを止める」。
    if (!code.isConnected) return;
    void highlightElement(code);
  });
}

/**
 * コードブロックのコピーボタン（F-VIEW-04）。
 *
 * `pre` の中に置くので、本文の流れに余計な要素が挟まらない。
 * 見えるのはホバー時とフォーカス時だけ（03.ux-spec/01-screen-layout.md §1 の「静けさ」）。
 */
function addCopyButton(pre: HTMLElement, code: HTMLElement): void {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'mx-copy';
  button.textContent = ja.preview.copy;
  button.setAttribute('aria-label', ja.preview.copyLabel);

  button.addEventListener('click', () => {
    void copy(code.textContent ?? '').then((ok) => {
      button.textContent = ok ? ja.preview.copied : ja.preview.copyFailed;
      button.dataset['mxState'] = ok ? 'ok' : 'error';
      // 1 回きりのタイマー。押されたときにしか作られない。
      setTimeout(() => {
        button.textContent = ja.preview.copy;
        delete button.dataset['mxState'];
      }, COPY_FEEDBACK_MS);
      return ok;
    });
  });

  pre.append(button);
}

/** コピー後の表示を戻すまでの時間。 */
const COPY_FEEDBACK_MS = 1200;

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // 権限が無い / セキュアコンテキストでない。通知バーに出すほどのことではないので、
    // ボタン自身の表示で伝える。
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* 画像（F-VIEW-08 / N-SEC-05）                                         */
/* ------------------------------------------------------------------ */

/**
 * すでにブラウザが解決できる形の src か。
 *
 * `http(s):` と `data:` はそのまま出せる（CSP の `img-src` が許可している）。
 * それ以外＝ローカルのパスだけを `resolve_asset` に通す。
 */
const READY = /^(?:https?:|data:|asset:|blob:)/i;

async function enhanceImages(container: HTMLElement, baseDir: string): Promise<void> {
  const images = [...container.querySelectorAll<HTMLImageElement>('img[src]')].filter((img) => !(DONE in img.dataset));
  if (images.length === 0) return;

  for (const img of images) img.dataset[DONE] = '';

  const local = images.filter((img) => !READY.test(img.getAttribute('src') ?? ''));
  if (local.length === 0 || baseDir === '') return;

  // 1 枚ごとに IPC が 1 往復する。アイドルに刻んで、スクロールを妨げない。
  await processInIdle(local, (img) => {
    const href = img.getAttribute('src') ?? '';
    void resolveImage(img, href, baseDir);
  });
}

async function resolveImage(img: HTMLImageElement, href: string, baseDir: string): Promise<void> {
  try {
    img.src = await getPlatform().resolveAsset(href, baseDir);
  } catch (e) {
    // 許可ディレクトリの外か、そもそも無い。**黙って壊れた画像を出さない。**
    //
    // 中心ユースケースは「LLM が生成した、自分が書いていないファイルを開く」こと
    // （ADR-0006）。`![](../../../.ssh/id_rsa)` が拒まれたことは、
    // ユーザーに見える形で伝わったほうがよい。
    img.replaceWith(blockedPlaceholder(href, isOutOfScope(e)));
  }
}

function isOutOfScope(e: unknown): boolean {
  return typeof e === 'object' && e !== null && 'kind' in e && e.kind === 'out-of-scope';
}

function blockedPlaceholder(href: string, outOfScope: boolean): HTMLElement {
  const box = document.createElement('span');
  box.className = 'mx-image-blocked';
  box.dataset['mxReason'] = outOfScope ? 'out-of-scope' : 'missing';

  const label = document.createElement('span');
  label.className = 'mx-image-blocked__reason';
  label.textContent = outOfScope ? ja.preview.imageOutOfScope : ja.preview.imageMissing;

  const path = document.createElement('code');
  path.className = 'mx-image-blocked__path';
  // textContent なので、href がどんな文字列でもここから HTML にはならない
  path.textContent = href;

  box.append(label, path);
  return box;
}
