/**
 * 「ファイルを開く」の唯一の経路。
 *
 * 開く入口は 5 つ（起動時の bootstrap / argv 転送 / ダイアログ / D&D / 相対リンク）あり、個別に実装すると記録漏れやスクロール位置の戻し忘れが入口ごとに起きるため、振る舞いの差はすべて引数で表す。
 * 描いた HTML も Markdown テキストもこの層は保持せず（ADR-0005）、ストアへ渡すのはメタ情報・アウトライン・計測値などの派生値だけである。
 */
import { pushHistory } from '@/features/history';
import { enhance, paint, scrollToAnchor } from '@/features/preview';
import { ja } from '@/i18n/ja';
import { toMessage } from '@/lib/error';
import { dirOf } from '@/lib/path';
import { refreshOutline, refreshSearch } from '@/lib/refresh';
import { mark } from '@/lib/trace';
import type { MarkdownParser, ParseOptions } from '@/markdown/parser';
import { getPlatform, type DocumentPayload, type Encoding } from '@/platform';

import { markClean } from './dirty';
import { confirmDiscard } from './discard';
import {
  documentStore,
  notifyStatus,
  toMeta,
  type NoticeAction,
  type StoredMeta,
  type StoredPayload,
} from './store.svelte';
import { setDocumentText } from './text';

const PREVIEW_SELECTOR = '#mx-preview';

/** 開く経路に注入する依存。起動時に `configureOpener` で 1 回だけ渡す。 */
export interface OpenerConfig {
  parser: MarkdownParser;
  /**
   * 開けたことを知らせる先（`features/workspace` のタブと最近開いたファイル）。
   *
   * 直接呼ばずに注入で受ける。
   * タブは「いま開いている文書の集合」であって文書より外側の概念であり、依存を workspace → document の 1 方向に保つ。
   * 逆向きにすると、タブが文書のメタ情報を参照した時点で feature が循環する。
   */
  onOpened: (meta: StoredMeta, options: { remember: boolean }) => void;
  /** 開けなかったことを知らせる先。消えたファイルを最近開いた一覧から外す。 */
  onMissing: (path: string) => void;
  /**
   * 現在の `preview.softBreak` の値。
   *
   * `document` は `settings` feature を参照しないため（02.architecture/03-layers.md §3）、パースのたびに読む関数として注入する。
   * 値そのものを固定すると設定変更後も古い値でパースし続ける。
   */
  softBreak: () => boolean;
  /**
   * 有効になっている追加記法（`markdown.*` / 04.tech-stack/04-markdown.md §3）。
   *
   * `softBreak` と同じ理由で、値ではなく読む関数として受ける。
   */
  syntax: () => readonly string[];
  /**
   * 開く先のタブ（`features/workspace`）。無ければそちらで作る。
   *
   * エディターはこれをキーにモデルを分け（`document/text.ts` の `DocumentIdentity`）、履歴もこれで分かれる（F-NAV-07）。
   * 5 つの入口すべてに引数として足す代わりに、ここで 1 回だけ問う。
   * タブ側は開く前にアクティブを移してあるため（`activateTab` / `openPathInNewTab`）、この時点の値が行き先である。
   */
  targetKey: () => number;
}

let config: OpenerConfig | null = null;

/**
 * パーサと設定を渡す。起動時に 1 回だけ呼ぶ。
 *
 * 開く側（ダイアログ / D&D / リンク）がパーサの存在を知らずに済むようにするための注入。
 */
export function configureOpener(next: OpenerConfig): void {
  config = next;
}

/**
 * 現在注入されているパーサ。Split の再描画（`live.ts`）が使う。
 *
 * 開く経路を通さずにパースする場面はここだけである。
 * 他から呼ぶ用途が生じた場合は、開く経路を迂回していないかを先に確認すること。
 */
export function getParser(): MarkdownParser | null {
  return config?.parser ?? null;
}

/** 現在の設定を反映したパース指定。`live.ts` の再描画がこれを使う。 */
export function getParseOptions(): ParseOptions {
  return { breaks: config?.softBreak() ?? false, syntax: config?.syntax() ?? [] };
}

/** `openDocument` / `openPath` の振る舞いの差を表す。5 つの入口の違いはすべてここに現れる。 */
export interface OpenOptions {
  /**
   * 経過時間の起点。既定は「読み込みを始めた時刻」。
   * ウォーム起動では argv 転送を受けた時刻を渡し、転送からの実時間を測る。
   */
  startedAt?: number;
  /** 先頭までスクロールを戻すか。起動直後は既に先頭なので不要。 */
  resetScroll?: boolean;
  /**
   * 描画後に戻すスクロール位置。同じファイルを開き直す再読み込み（F5）だけが使う。
   * `resetScroll` と同時に指定しない。
   */
  restoreScroll?: number;
  /** 最近開いたファイルに加えるか。既定 true。 */
  remember?: boolean;
  /**
   * 未保存の変更を捨ててよいか尋ねるか。既定 true（F-EDIT-03）。
   *
   * false にするのは、捨てるものが無いことが呼び出し側で分かっている場合だけである。
   * タブへ開く経路がこれにあたる。いまの文書はタブとして残るため何も失われず、タブを切り替えるたびに確認が出ると操作が成立しない（`features/workspace/tabs.svelte.ts`）。
   */
  confirm?: boolean;
  /**
   * 描画後に移動するページ内アンカー（`./other.md#section` の `#` 以降）。
   *
   * `restoreScroll` と同時には指定しない。
   * 位置の復元と指定した見出しへの移動は、どちらか一方しか成立しない。
   */
  anchor?: string;
  /**
   * 戻る / 進むの履歴に加えるか。既定は true（F-NAV-07）。
   *
   * false にするのは同じ位置を維持する操作だけである。
   * 再読み込み（`F5` / 外部変更）と、履歴そのものを辿る移動（`Alt+←` / `Alt+→`）がこれにあたる。
   */
  history?: boolean;
  /** 起動計測の T6 / T7 / T8 を打つか。コールド起動だけが true。 */
  trace?: boolean;
  /**
   * エンコーディングの指定（03.ux-spec/07-status-and-notifications.md §3「クリックでエンコーディング再解釈」）。
   * 省略すると Rust 側の推定に任せる。
   *
   * 渡すのは `reinterpret()` だけ（`document/encoding.ts`）。
   */
  encoding?: Encoding;
  /**
   * パースを開始した直後、結果を待つ前に呼ばれる。
   *
   * 起動シーケンス（02.architecture/05-startup-sequence.md §1）がシェルを描画するための拡張点である。
   * ここでの処理はパース時間と重なる。この用途のためだけに存在する引数である。
   */
  betweenParseAndPaint?: () => void;
}

/** `reloadCurrent` の振る舞いの差を表す。 */
export interface ReloadOptions {
  /**
   * エンコーディングを指定して読み直す（再解釈 / `document/encoding.ts`）。
   *
   * 外部変更による自動再読み込みでは渡さない。
   * その経路ではファイルの内容が変わっているため、推定もやり直すのが正しい。
   * 指定が残り続けると、書き換えられて別のエンコーディングになったファイルを古い指定で読み続けることになる。
   */
  encoding?: Encoding;
  /**
   * 読み直した後にステータスバーへ出す文言。既定は「再読み込みしました」（`F5`）。
   *
   * 差し替えるのは文言だけで足りる。
   * 操作によるものか外部変更によるものかで変わるのは何が起きたかの説明であり、読み直しの手順ではない。
   */
  status?: string;
}

/** 開き終えたときの計測値。開発ビルドのステータスバーと起動計測が使う。 */
export interface OpenOutcome {
  parseMs: number;
  /** 最初のチャンクが見えるまでの経過ミリ秒（`startedAt` 起点）。 */
  paintMs: number;
  chunks: number;
}

/**
 * 本文を手に持っている状態から開く。
 *
 * 起動時の bootstrap 経路がこれを使う。
 * ファイルを読み直さないことが要点で、Rust が WebView 初期化と並行して読んだ内容をそのまま使う。
 */
export async function openDocument(payload: StoredPayload, options: OpenOptions = {}): Promise<OpenOutcome | null> {
  const opener = config;
  if (!opener) throw new Error('configureOpener が呼ばれていない');

  const startedAt = options.startedAt ?? performance.now();
  // パースを先に開始してから待つ（シェル描画と重ねるため）。
  traceMark(options, 'T6', `${payload.content.length} chars`);
  const parsing = opener.parser.parse(payload.content, { breaks: opener.softBreak(), syntax: opener.syntax() });

  // 開く先のタブ。本文の載せ先（Monaco のモデル）と履歴の分かれ目がこれで決まる。
  const key = opener.targetKey();

  // 本文を差し替える前に、現在のスクロール位置を履歴へ記録する（F-NAV-07）。
  // 無題の文書は戻り先として指定できないため加えない。
  if (options.history !== false && payload.path !== null) pushHistory(key, payload.path, previewScrollTop());

  // 本文を除いてから入れる。
  // そのまま代入すると `content` が実行時に残り、ストアが本文を保持し続ける（`toMeta`）。
  const meta = toMeta(payload);
  documentStore.meta = meta;

  // 本文はストアではなく素のモジュールへ（ADR-0005 / `document/text.ts`）。
  // エディターがマウントされていれば Monaco への書き込みを伴うため、T6→T7 の並行処理を維持できるようパースの開始後に置く。
  //
  // どのタブのどの文書かを一緒に渡す。
  // これが無いと 1 つのモデルを使い回すことになり、切り替えた先で Undo したときに前の文書の本文が編集面へ入る（N-CMP-03）。
  setDocumentText(payload.content, { key, documentId: payload.path ?? UNTITLED_ID });

  // ディスクと一致した状態から始める。開き直しでもここを通るので再読み込み後にダーティが残らない（F-EDIT-03）。
  markClean();

  options.betweenParseAndPaint?.();

  try {
    const parsed = await parsing;
    traceMark(options, 'T7', `${parsed.chunks.length} chunks, parse=${parsed.parseMs.toFixed(1)}ms`);

    const container = document.querySelector<HTMLElement>(PREVIEW_SELECTOR);
    if (!container) throw new Error(`${PREVIEW_SELECTOR} が見つからない`);

    const result = paint(container, parsed.chunks, parsed.frontMatter, parsed.blocks);
    if (options.resetScroll === true) container.scrollTop = 0;
    else if (options.restoreScroll !== undefined) container.scrollTop = options.restoreScroll;

    documentStore.frontMatter = parsed.frontMatter;
    documentStore.textStats = parsed.textStats;
    documentStore.notice = null;

    // 「読める」瞬間は DOM 挿入ではなく次のフレーム（05.performance-budget/05-operations.md §2）。
    await nextFrame();
    traceMark(options, 'T8');

    // アウトラインの差し替えは T8 の後（F-VIEW-02）。
    // ライトペインが開いていると 1 見出し 1 要素の再描画が発生し、`huge.md`（見出し 1249 個）で 70〜110ms かかる。
    // 手前に置くとそれが丸ごと T3→T8 に加算されてしまう。
    documentStore.outline = parsed.outline;

    const outcome: OpenOutcome = {
      parseMs: parsed.parseMs,
      paintMs: result.firstChunkAt - startedAt,
      chunks: parsed.chunks.length,
    };
    documentStore.stats = outcome;

    // 画像解決・コピーボタン・ハイライトは T8 の後に行う（読むのに不要な処理のため）。
    // 段階的描画では最初のチャンクしかまだ DOM に無いので、残りが入り終わったらもう一度呼ぶ（`enhance` は処理済みの要素を対象外にする）。
    // 無題の文書は基点が無いため、相対パスの画像はスコープ外として扱われる（`preview/enhance.ts`）。
    const enhanceOptions = { baseDir: dirOf(payload.path ?? '') };
    enhance(container, enhanceOptions);

    refreshSearch();

    // `./other.md#section` の着地点（F-VIEW-05 / F-VIEW-07）。段階的描画では飛び先がまだ無いことがあるため、見つからなかったときだけ全チャンク投入後に再試行する。
    let anchorPending = options.anchor !== undefined && !scrollToAnchor(container, options.anchor);

    // 残りのチャンクは idle で入る（待たない）。
    void result.done.then((at) => {
      enhance(container, enhanceOptions);
      refreshOutline();
      if (anchorPending && options.anchor !== undefined) {
        anchorPending = !scrollToAnchor(container, options.anchor);
      }
      // 段階的描画中は scrollHeight が足りず復元位置が上限で切り詰められるため、全部入ったら設定し直す。
      if (options.restoreScroll !== undefined && container.scrollTop < options.restoreScroll) {
        container.scrollTop = options.restoreScroll;
      }
      if (options.trace === true) mark('T8-all', `${(at - startedAt).toFixed(1)}ms`);
      return at;
    });

    opener.onOpened(meta, { remember: options.remember !== false });

    // 無題の文書は監視に載らない（ディスクに実体が無いため）。
    // 表示中のファイルだけを監視する（N-PERF-05）。前のファイルの監視は Rust 側で解除される。
    if (payload.path !== null) void watch(payload.path);

    return outcome;
  } catch (e) {
    documentStore.notice = { level: 'error', message: `${ja.error.renderFailed}: ${toMessage(e)}` };
    return null;
  }
}

/**
 * パスから開く。読み込みの失敗もここで処理する。
 *
 * 開けなかったファイルは履歴から外す。
 * 消えたファイルを一覧に残し続けると、次の起動でも同じ失敗が起きる（03.ux-spec/08-empty-states.md §1 の一覧は道具であって記録ではない）。
 */
export async function openPath(path: string, options: OpenOptions = {}): Promise<OpenOutcome | null> {
  // 編集中の内容を捨てる前に尋ねる（F-EDIT-03）。開くと決まっていないので I/O より前に置く。
  if (options.confirm !== false && !(await confirmDiscard())) return null;

  const startedAt = options.startedAt ?? performance.now();

  let payload: DocumentPayload;
  try {
    payload = await getPlatform().readDocument(path, options.encoding);
  } catch (e) {
    const kind = kindOf(e);
    // 履歴から外したときだけ、そのことを文面に足す。外していないのに書くと、起きていないことを伝える。
    const missing = kind === 'not-found' && config !== null;
    documentStore.notice = {
      level: 'error',
      message: describeOpenError(e, path) + (missing ? ja.error.removedFromRecent : ''),
      // Marxdown では読めないが、OS の既定アプリでなら開ける（F-VIEW-06）。
      // ファイルツリーは Markdown 以外も並べる以上、画像や書庫を選ぶこと自体は避けられない。
      ...(kind === 'binary' && { actions: externalOpenActions(path) }),
    };
    if (missing) config?.onMissing(path);
    return null;
  }

  return openDocument(payload, { resetScroll: true, ...options, startedAt });
}

/**
 * Marxdown では開けないファイルを既定アプリで開く経路（F-VIEW-06）。
 *
 * 本文中の非 Markdown リンクと同じ選択肢を出す（`preview/links.ts` の `confirmOpenExternally`）。
 * ファイルツリーは Markdown 以外も並べるため、画像や書庫を選ぶ操作自体は起こりうる。
 * 開けないと伝えるだけで終えると、そこから先へ進む手段が画面上に無くなる。
 */
export function externalOpenActions(path: string): NoticeAction[] {
  return [
    {
      label: ja.link.open,
      run: () => {
        void getPlatform()
          .openLocalFile(path)
          .catch(() => {
            // 許可ディレクトリの外であれば Rust 側が拒否する。
            documentStore.notice = { level: 'error', message: ja.link.outOfScope(path) };
          });
      },
    },
    {
      label: ja.link.reveal,
      run: () => {
        void getPlatform().revealInFileManager(path);
      },
    },
  ];
}

/** ダイアログから開く（F-OPEN-07）。取り消されたら何もしない。 */
export async function openViaDialog(): Promise<OpenOutcome | null> {
  const picked = await getPlatform().pickFile();
  if (picked === null) return null;
  return openPath(picked);
}

/**
 * いま開いているファイルを、ディスクの最新の内容で開き直す（F5）。
 *
 * F5 は WebView 自身の「再読み込み」に割り当たっているため、そのまま通すと `initialization_script` の起動時 bootstrap が再適用され、指定ファイルが再読み込みされてその後に開いたファイルの内容が上書きされてしまう。
 * ここで意味を上書きし、読み直しとパースだけで済ませる（ウォーム起動と同じ経路）。
 * スクロール位置は保つ（先頭に戻ると「更新」ではなく「開き直し」になる）。
 * 外部変更の自動再読み込み（`watch.ts`）もここを通る。
 */
export async function reloadCurrent(options: ReloadOptions = {}): Promise<OpenOutcome | null> {
  const meta = documentStore.meta;
  if (meta === null) return null;
  // 無題の文書（`Ctrl+N`）には読み直す対象が無いため、F5 では何もしない。
  if (meta.path === null) return null;

  const container = document.querySelector<HTMLElement>(PREVIEW_SELECTOR);

  const outcome = await openPath(meta.path, {
    // キーごと省く（`exactOptionalPropertyTypes` では `encoding: undefined` と「指定なし」が別物になる）。
    ...(options.encoding && { encoding: options.encoding }),
    resetScroll: false,
    restoreScroll: container?.scrollTop ?? 0,
    remember: false,
    // 同じ位置を維持する操作であるため履歴に加えない（加えると `Alt+←` が期待どおりに戻らなくなる）。
    history: false,
  });

  // 内容が同じで画面が変化しない場合も、操作を受け付けたことは伝える（3 秒で消えるステータスバーのメッセージ）。
  if (outcome) notifyStatus(options.status ?? ja.open.reloaded);
  return outcome;
}

/** 監視の付け替え。失敗しても開く操作自体は成功しているため無視する（`F5` で読み直せる）。 */
async function watch(path: string): Promise<void> {
  try {
    await getPlatform().watchPath(path);
  } catch {
    // 監視できなくても致命的ではない
  }
}

/** 本文の現在のスクロール位置。履歴（F-NAV-07）が記録する値。 */
export function previewScrollTop(): number {
  return document.querySelector<HTMLElement>(PREVIEW_SELECTOR)?.scrollTop ?? 0;
}

/** 無題の文書（`Ctrl+N`）の識別子。パスが無いものを 1 つの文書として表す。 */
const UNTITLED_ID = '<untitled>';

function traceMark(options: OpenOptions, id: string, note?: string): void {
  if (options.trace !== true) return;
  if (note === undefined) mark(id);
  else mark(id, note);
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

function kindOf(e: unknown): string | null {
  if (typeof e === 'object' && e !== null && 'kind' in e) {
    return String((e as { kind: unknown }).kind);
  }
  return null;
}

/** Rust の `CoreError` を日本語 1 行の文言に変換する。 */
export function describeOpenError(e: unknown, path: string): string {
  const kind = kindOf(e);
  if (kind !== null) {
    const entry = (ja.error as Record<string, unknown>)[kind];
    if (typeof entry === 'function') return (entry as (p: string) => string)(path);
    if (typeof entry === 'string') return entry;
  }
  return toMessage(e);
}
