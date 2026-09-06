/**
 * 本文中のリンククリックの分岐（F-VIEW-05, 06, 07 / N-SEC-04 / 02.architecture/09-security.md §2）。
 * `#anchor` はページ内スクロール、`./x.md` はアプリ内で開く、他のローカルパスは確認の上で既定アプリ、`http(s)`/`mailto` は既定ブラウザ・メーラー、未知のスキームは何もしない。
 * 許可リスト方式であり、中心ユースケースが信頼できない Markdown を開くことのため、「危険なものを弾く」方式だと未知のスキームで安全性の欠陥が生じる（ADR-0006）。
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
 * リンクから本文の外へ出るときの手（`app/bootstrap.ts` が起動時に渡す）。
 *
 * 開くのも知らせるのも `document` の仕事だが、あちらは本文を描くために
 * この feature を参照している。直接呼び返すと feature 単位で循環するため、
 * 向きを一方向（`document → preview`）に保つ目的で注入にしてある
 * （`features/history` の `configureHistory` と同じ形）。
 */
export interface LinkTargets {
  /** いま開いているファイルのパス。相対リンクの基点。無題なら空文字。 */
  currentPath: () => string;
  /** Markdown をアプリ内で開く。 */
  open: (path: string, anchor: string | undefined) => void;
  /**
   * 通知バーに出す。**構造だけ `documentStore.notice` と合わせてある。**
   * 渡す側の代入が型で照合されるので、食い違えば `bootstrap.ts` で落ちる。
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
 * 個々の `<a>` にハンドラを付けないのは、段階的描画で後から増える要素にも
 * 効かせるため。イベント委譲なら「まだ描かれていない本文」にも最初から効く。
 */
export function installLinkHandler(container: HTMLElement, next: LinkTargets): () => void {
  targets = next;

  const onClick = (event: MouseEvent) => {
    // 修飾クリックと中クリックは「別の場所で開く」意図。タブが実装されるまでは、
    // 何もしないほうが、既定の挙動（＝ナビゲーション）が漏れるより安全。
    if (event.defaultPrevented) return;

    const anchor = (event.target as Element | null)?.closest('a');
    if (!anchor) return;

    const href = anchor.getAttribute('href');
    event.preventDefault();

    // サニタイザが落とした href（未知のスキーム）はここに来ない。
    // 二重に見るのは、DOMPurify の既定が緩んだときの影響を受けないため。
    if (href === null || href === '') return;

    handle(href, container);
  };

  container.addEventListener('click', onClick);
  return () => container.removeEventListener('click', onClick);
}

function handle(href: string, container: HTMLElement): void {
  // --- ページ内アンカー（F-VIEW-07） ---------------------------------
  if (href.startsWith('#')) {
    scrollToAnchor(container, href.slice(1));
    return;
  }

  const scheme = SCHEME.exec(href)?.[1]?.toLowerCase();

  // --- 外部リンク（F-VIEW-06 / N-SEC-04） ----------------------------
  if (scheme !== undefined && EXTERNAL.test(href)) {
    void getPlatform().openExternal(href);
    return;
  }

  // --- ローカルのパス（F-VIEW-05） -----------------------------------
  const localPath = toLocalPath(href, scheme);
  if (localPath === null) return; // 未知のスキーム。何もしない

  const baseDir = dirOf(targets?.currentPath() ?? '');
  const resolved = joinPath(baseDir, localPath);

  if (isMarkdownPath(resolved)) {
    // `./other.md#section` の `#` 以降はパスの一部ではない。付けたまま渡すと
    // Rust 側で「そんなファイルは無い」になる。**開いた後の着地点**として渡す
    // （相互リンクされた文書群では、節を名指しするリンクが普通に出てくる）。
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
 * **確認してから開く。** OS の既定アプリに渡す行為は取り消せないので、
 * 本文に書かれていただけのパスを黙って起動しない。
 * モーダルにしないのは、データ消失の可能性が無いから（03.ux-spec/07-status-and-notifications.md §2）。
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
              // 許可ディレクトリの外だと Rust 側が拒む。何が起きたか黙らない。
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

/** `path#fragment` を割る。フラグメントが無ければ `undefined`。 */
function splitFragment(path: string): [string, string | undefined] {
  const index = path.indexOf('#');
  if (index < 0) return [path, undefined];
  return [path.slice(0, index), path.slice(index + 1)];
}

/**
 * `file://` を含めてローカルパスに直す。未知のスキームは `null`。
 *
 * `C:\...` `C:/...` はスキーム付きに見えるが Windows の絶対パス。
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
