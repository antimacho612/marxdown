/**
 * 描画済みの本文に後から手を入れる工程（F-VIEW-03, 04, 08）。
 *
 * `paint()` で本文が読める（T8）後、アイドル時間で画像解決・コピーボタン・シンタックスハイライトを行う。
 * どれも読み始めるのに不要で、T8 の手前に置くとその分だけ読める時間が伸びるためである（05.performance-budget/04-targets.md §1）。
 * 段階的描画で `paint()` は最初のチャンクだけ同期で入れるため `enhance()` は 2 回呼ばれる。
 * 処理済み要素には印を付け、2 回目は新しく増えた分だけ見る（MutationObserver は使わず、アイドル時の監視を増やさない）。
 */
import { ja } from '@/i18n/ja';
import { processInIdle } from '@/lib/idle';
import { getPlatform } from '@/platform';

/** 処理済みの印。2 回目の `enhance` はこれを見て未処理の要素だけを対象にする。 */
const DONE = 'mxEnhanced';

/** `enhance` の引数。 */
export interface EnhanceOptions {
  /** 相対パスの画像を解決する基準。開いているファイルの親ディレクトリ。 */
  baseDir: string;
}

/**
 * 未処理の要素を拾って手を入れる。
 *
 * それぞれの処理は互いに独立しているため、別々のアイドル処理として実行する。
 * 画像 1 枚の解決が遅いためにコピーボタンが表示されない、という依存関係を作らない。
 */
export function enhance(container: HTMLElement, options: EnhanceOptions): void {
  void enhanceCodeBlocks(container);
  void enhanceImages(container, options.baseDir);
}

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

  // ハイライトは遅延チャンクに置いてある。
  // コードブロックが 1 つも無いドキュメントではここに到達しないため、`highlight` チャンクは読み込まれない
  // （02.architecture/05-startup-sequence.md §3 の分割境界）。
  const { highlightElement, languageOf } = await import('./lazy/highlight');
  const targets = blocks.filter((code) => languageOf(code) !== null);

  await processInIdle(targets, (code) => {
    // DOM から切り離された要素は処理しない（OQ-18）。
    //
    // `enhance` はアイドル時に少しずつ進むため、その途中で次のファイルが開かれると、対象は `paint()` の `replaceChildren()` によって DOM から外れている。
    // ハイライトは 1 ブロックあたり数百 µs かかる処理であり、表示されない要素に対して実行する必要はない。
    //
    // `paint` 側の打ち切り（`cancelPaint`）とは役割が異なる。
    // `cancelPaint` は DOM の構築を止め、こちらは構築済みの要素への追加処理を止める。
    if (!code.isConnected) return;
    void highlightElement(code);
  });
}

/**
 * コードブロックのコピーボタン（F-VIEW-04）。
 *
 * `pre` の中に配置するため、本文の流れに要素が挟まらない。
 * 表示するのはホバー時とフォーカス時だけである（03.ux-spec/01-screen-layout.md §1 の「静けさ」）。
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
      // 1 回だけのタイマー。押されたときにしか生成されない。
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
    // 権限が無い場合やセキュアコンテキストでない場合に失敗する。
    // 通知バーに出すほどの内容ではないため、ボタン自身の表示で伝える。
    return false;
  }
}

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

  // 1 枚ごとに IPC が 1 往復する。アイドル時に分割して実行し、スクロールを妨げないようにする。
  await processInIdle(local, (img) => {
    const href = img.getAttribute('src') ?? '';
    void resolveImage(img, href, baseDir);
  });
}

async function resolveImage(img: HTMLImageElement, href: string, baseDir: string): Promise<void> {
  try {
    img.src = await getPlatform().resolveAsset(href, baseDir);
  } catch (e) {
    // 許可ディレクトリの外にあるか、ファイルが存在しない。
    // 壊れた画像をそのまま表示せず、理由を示すプレースホルダに置き換える。
    //
    // 中心ユースケースは「LLM が生成した、自分が書いていないファイルを開く」ことである（ADR-0006）。
    // `![](../../../.ssh/id_rsa)` が拒否されたことは、ユーザーに見える形で伝える。
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
  // `textContent` で設定するため、href がどのような文字列でもここから HTML として解釈されることはない
  path.textContent = href;

  box.append(label, path);
  return box;
}
