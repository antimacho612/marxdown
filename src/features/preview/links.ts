/**
 * 本文中のリンククリックの分岐（F-VIEW-05, 06, 07 / N-SEC-04 / 02.architecture/09-security.md §2）。
 * `#anchor` はページ内スクロール、`./x.md` はアプリ内で開く、他のローカルパスは確認の上で既定アプリ、`http(s)`/`mailto` は既定ブラウザ・メーラー、未知のスキームは何もしない。
 * 許可リスト方式であり、中心ユースケースが信頼できない Markdown を開くことのため、「危険なものを除外する」方式だと未知のスキームで安全性の欠陥が生じる（ADR-0006）。
 *
 * どの分岐でも必ず `preventDefault()` する。
 * WebView がページ遷移するとアプリのシェルごと差し替わり復帰できないためである（N-SEC-04）。
 */
import { ja } from '@/i18n/ja';
import { dirOf, isMarkdownPath, joinPath } from '@/lib/path';
import { getPlatform } from '@/platform';

import { safeDecode, scrollToAnchor } from './anchor';

/** 既定ブラウザ / メールクライアントに渡してよいスキーム。 */
const EXTERNAL = /^(?:https?|mailto):/i;

/** 何らかのスキームが付いているか。付いていなければ相対パス。 */
const SCHEME = /^([a-z][a-z0-9+.-]*):/i;

/**
 * リンクから本文の外へ移動するときの処理（`app/bootstrap.ts` が起動時に渡す）。
 *
 * 開く処理も通知も `document` が担当するが、`document` は本文を描画するためにこの feature を参照している。
 * 直接呼び返すと feature 単位で循環するため、依存の向きを `document → preview` の一方向に保つ目的で注入にしてある（`features/history` の `configureHistory` と同じ形）。
 */
export interface LinkTargets {
  /** いま開いているファイルのパス。相対リンクの基点。無題なら空文字。 */
  currentPath: () => string;
  /** Markdown をアプリ内で開く。 */
  open: (path: string, anchor: string | undefined) => void;
  /**
   * 通知バーに出す。構造だけを `documentStore.notice` に合わせてある。
   * 渡す側の代入が型で検査されるため、食い違えば `bootstrap.ts` で型エラーになる。
   */
  notify: (notice: {
    level: 'info' | 'error';
    message: string;
    actions?: { label: string; run: () => void }[];
  }) => void;
}

let targets: LinkTargets | null = null;

/**
 * プレビュー内のクリックを 1 か所で受ける。
 *
 * 個々の `<a>` にハンドラを付けないのは、段階的描画で後から追加される要素にも適用するためである。
 * イベント委譲であれば、まだ描画されていない本文に対しても最初から動作する。
 */
export function installLinkHandler(container: HTMLElement, next: LinkTargets): () => void {
  targets = next;

  const onClick = (event: MouseEvent) => {
    // 他のハンドラが既定動作を止めたクリックは扱わない。
    if (event.defaultPrevented) return;

    const anchor = (event.target as Element | null)?.closest('a');
    if (!anchor) return;

    const href = anchor.getAttribute('href');
    event.preventDefault();

    // サニタイザが除去した href（未知のスキーム）はここには到達しない。
    // 二重に判定するのは、DOMPurify の既定が変わった場合の影響を受けないためである。
    if (href === null || href === '') return;

    handle(href, container);
  };

  container.addEventListener('click', onClick);
  return () => container.removeEventListener('click', onClick);
}

function handle(href: string, container: HTMLElement): void {
  // ページ内アンカー（F-VIEW-07）
  if (href.startsWith('#')) {
    scrollToAnchor(container, href.slice(1));
    return;
  }

  const scheme = SCHEME.exec(href)?.[1]?.toLowerCase();

  // 外部リンク（F-VIEW-06 / N-SEC-04）
  if (scheme !== undefined && EXTERNAL.test(href)) {
    void getPlatform().openExternal(href);
    return;
  }

  // ローカルのパス（F-VIEW-05）
  const localPath = toLocalPath(href, scheme);
  if (localPath === null) return; // 未知のスキーム。何もしない

  const baseDir = dirOf(targets?.currentPath() ?? '');
  const resolved = joinPath(baseDir, localPath);

  if (isMarkdownPath(resolved)) {
    // `./other.md#section` の `#` 以降はパスの一部ではない。
    // 付けたまま渡すと Rust 側で not-found になるため、開いた後のスクロール先として別に渡す（相互にリンクされた文書群では、節を指定するリンクが頻繁に現れる）。
    const [path, anchor] = splitFragment(resolved);
    // 相対パスの正規化は Rust 側（`read_document` の canonicalize）に任せる。
    targets?.open(path, anchor);
    return;
  }

  confirmOpenExternally(resolved);
}

/**
 * Markdown 以外のローカルファイル（F-VIEW-06）。
 *
 * 確認してから開く。
 * OS の既定アプリに渡す操作は取り消せないため、本文に書かれているだけのパスを確認なしに起動しない。
 * モーダルにしないのは、データ消失の可能性が無いためである（03.ux-spec/07-status-and-notifications.md §2）。
 */
function confirmOpenExternally(path: string): void {
  targets?.notify({
    level: 'info',
    message: ja.link.confirmOpen(path),
    actions: [
      {
        label: ja.link.open,
        run: () => {
          void getPlatform()
            .openLocalFile(path)
            .catch(() => {
              // 許可ディレクトリの外であれば Rust 側が拒否する。その結果は通知に出す。
              targets?.notify({ level: 'error', message: ja.link.outOfScope(path) });
            });
        },
      },
      {
        label: ja.link.reveal,
        run: () => {
          void getPlatform().revealInFileManager(path);
        },
      },
    ],
  });
}

/** `path#fragment` を分割する。フラグメントが無ければ `undefined` を返す。 */
function splitFragment(path: string): [string, string | undefined] {
  const index = path.indexOf('#');
  if (index < 0) return [path, undefined];
  return [path.slice(0, index), path.slice(index + 1)];
}

/**
 * `file://` を含めてローカルパスに直す。未知のスキームは `null`。
 *
 * `C:\...` や `C:/...` はスキーム付きに見えるが Windows の絶対パスである。
 * `sanitize.ts` の `isAllowedUri` と同じ判定をここでも行う。
 */
function toLocalPath(href: string, scheme: string | undefined): string | null {
  if (scheme === undefined) return href; // 相対パス
  if (scheme.length === 1 && /^[a-z]:[\\/]/i.test(href)) return href; // ドライブレター

  if (scheme === 'file') {
    try {
      return safeDecode(new URL(href).pathname.replace(/^\/(?=[a-z]:)/i, ''));
    } catch {
      return null;
    }
  }

  return null;
}
