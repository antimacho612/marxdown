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
import { dirOf } from '@/lib/path';
import { getPlatform, type CoreError } from '@/platform';

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
    img.replaceWith(blockedPlaceholder(img, href, baseDir, coreError(e)));
  }
}

/** Rust から返ったエラー（`src-tauri/src/error.rs`）。形が違えば `null`。 */
function coreError(e: unknown): CoreError | null {
  return typeof e === 'object' && e !== null && 'kind' in e ? (e as CoreError) : null;
}

/**
 * 拒まれた画像のプレースホルダ。
 *
 * スコープ外のときは許可ボタンを添える（OQ-17 / 02.architecture/09-security.md §3）。
 * **出すのは解決後のパスである**（`CoreError.path`）。
 * ドキュメントに書かれた `../../../.ssh/id_rsa` ではなく、symlink まで解決した実際の行き先を見せないと、
 * 何を許可しようとしているのかを判断できない。
 */
function blockedPlaceholder(
  img: HTMLImageElement,
  href: string,
  baseDir: string,
  error: CoreError | null,
): HTMLElement {
  const outOfScope = error?.kind === 'out-of-scope';
  const real = error?.path ?? href;

  const box = document.createElement('span');
  box.className = 'mx-image-blocked';
  box.dataset['mxReason'] = outOfScope ? 'out-of-scope' : 'missing';
  // 許可が通った後に、同じディレクトリの他の 1 枚をここから引き直す（`retryBlocked`）。
  box.dataset['mxHref'] = href;
  box.dataset['mxBase'] = baseDir;
  box.dataset['mxAlt'] = img.alt;

  const label = document.createElement('span');
  label.className = 'mx-image-blocked__reason';
  label.textContent = outOfScope ? ja.preview.imageOutOfScope : ja.preview.imageMissing;

  const path = document.createElement('code');
  path.className = 'mx-image-blocked__path';
  // `textContent` で設定するため、パスがどのような文字列でもここから HTML として解釈されることはない
  path.textContent = real;

  box.append(label, path);
  if (outOfScope) box.append(allowButton(box, href, baseDir, real, label));
  return box;
}

/**
 * 「このフォルダの画像を許可」。
 *
 * 許可されるのはその画像があるディレクトリ 1 つだけで、配下へは広がらない。
 * アプリを終了すれば消える（OQ-17 の決定）。
 */
function allowButton(
  box: HTMLElement,
  href: string,
  baseDir: string,
  real: string,
  label: HTMLElement,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'mx-image-blocked__allow';
  button.textContent = ja.preview.imageAllow;
  button.title = ja.preview.imageAllowHint(dirOf(real));

  button.addEventListener('click', () => {
    void (async () => {
      try {
        restoreImage(box, await getPlatform().allowImageDir(href, baseDir));
        // 同じディレクトリに他の画像があれば、押し直さずに表示される。
        void retryBlocked();
      } catch {
        // 消えた / 権限が無い。通知バーには出さない。押したボタンの隣で伝わる。
        label.textContent = ja.preview.imageAllowFailed;
      }
    })();
  });

  return button;
}

/** プレースホルダを画像へ戻す。 */
function restoreImage(box: HTMLElement, src: string): void {
  const img = document.createElement('img');
  img.src = src;
  img.alt = box.dataset['mxAlt'] ?? '';
  // 解決済みである。次の `enhance` で拾い直さない。
  img.dataset[DONE] = '';
  box.replaceWith(img);
}

/**
 * 残っているプレースホルダを引き直す。許可が通った直後に 1 回だけ呼ぶ。
 *
 * 許可の単位はディレクトリなので、同じ場所を指していた他の画像もここで表示される。
 * **1 つのドキュメントに 20 枚あってもボタンは 1 回で済む**、というのが単位を
 * 「画像 1 枚」にしなかった理由である（OQ-17）。他の場所を指すものは拒まれたまま残る。
 */
async function retryBlocked(): Promise<void> {
  const boxes = [...document.querySelectorAll<HTMLElement>('.mx-image-blocked[data-mx-reason="out-of-scope"]')];
  await processInIdle(boxes, (box) => {
    const href = box.dataset['mxHref'];
    const baseDir = box.dataset['mxBase'];
    if (href === undefined || baseDir === undefined) return;

    void getPlatform()
      .resolveAsset(href, baseDir)
      .then((src) => restoreImage(box, src))
      .catch(() => {
        // まだ許可されていない場所である。そのまま残す。
      });
  });
}
