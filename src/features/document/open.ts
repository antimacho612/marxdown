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
import type { MarkdownParser } from '@/markdown/parser';
import { getPlatform, type DocumentPayload, type Encoding } from '@/platform';

import { markClean } from './dirty';
import { confirmDiscard } from './discard';
import { documentStore, notifyInfo, toMeta, type StoredMeta, type StoredPayload } from './store.svelte';
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
  /** 最近開いたファイルに積むか。既定 true。 */
  remember?: boolean;
  /**
   * 未保存の変更を捨ててよいか尋ねるか。既定 true（F-EDIT-03）。
   *
   * false にするのは、**捨てるものが無い**ことが呼び出し側で分かっている場合だけである。
   * タブへ開く経路がこれにあたる。いまの文書はタブとして残るため何も失われず、
   * タブを切り替えるたびに確認が出ると操作が成立しない（`features/workspace/tabs.svelte.ts`）。
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
   * 戻る / 進むの履歴に積むか。既定は true（F-NAV-07）。
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
   * 読み直した後に出す情報通知の文言。既定は「再読み込みしました」（`F5`）。
   *
   * 差し替えるのは文言だけで足りる。
   * 操作によるものか外部変更によるものかで変わるのは何が起きたかの説明であり、読み直しの手順ではない。
   */
  notice?: string;
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
  const parsing = opener.parser.parse(payload.content);

  // 本文を差し替える前に、現在のスクロール位置を履歴へ記録する（F-NAV-07）。
  // 無題の文書は戻り先として指定できないため積まない。
  if (options.history !== false && payload.path !== null) pushHistory(payload.path, previewScrollTop());

  // 本文を落としてから入れる。
  // そのまま代入すると `content` が実行時に残り、ストアが本文を保持し続ける（`toMeta`）。
  const meta = toMeta(payload);
  documentStore.meta = meta;

  // 本文はストアではなく素のモジュールへ（ADR-0005 / `document/text.ts`）。
  // エディターがマウントされていれば Monaco への書き込みを伴うため、T6→T7 の並行処理を維持できるようパースの開始後に置く。
  setDocumentText(payload.content);

  // ディスクと一致した状態から始める。開き直しでもここを通るので
  // 再読み込み後にダーティが残らない（F-EDIT-03）。
  markClean();

  options.betweenParseAndPaint?.();

  try {
    const parsed = await parsing;
    traceMark(options, 'T7', `${parsed.chunks.length} chunks, parse=${parsed.parseMs.toFixed(1)}ms`);

    const container = document.querySelector<HTMLElement>(PREVIEW_SELECTOR);
    if (!container) throw new Error(`${PREVIEW_SELECTOR} が見つからない`);

    const result = paint(container, parsed.chunks, parsed.frontMatter);
    if (options.resetScroll === true) container.scrollTop = 0;
    else if (options.restoreScroll !== undefined) container.scrollTop = options.restoreScroll;

    documentStore.frontMatter = parsed.frontMatter;
    documentStore.textStats = parsed.textStats;
    documentStore.notice = null;

    // 「読める」瞬間は DOM 挿入ではなく次のフレーム（05.performance-budget/05-operations.md §2）。
    await nextFrame();
    traceMark(options, 'T8');

    // アウトラインの差し替えは T8 の後（F-VIEW-02）。
    // ライトペインが開いていると 1 見出し 1 要素の再描画が走り、`huge.md`（見出し 1249 個）で実測 70〜110ms かかる。
    // 手前に置くとそれが丸ごと T3→T8 に加算されてしまう。
    documentStore.outline = parsed.outline;

    const outcome: OpenOutcome = {
      parseMs: parsed.parseMs,
      paintMs: result.firstChunkAt - startedAt,
      chunks: parsed.chunks.length,
    };
    documentStore.stats = outcome;

    // 画像解決・コピーボタン・ハイライトは T8 の後に行う（読むのに不要な処理のため）。
    // 段階的描画では最初のチャンクしかまだ DOM に無いので、残りが入り終わったらもう一度呼ぶ（`enhance` は処理済みを飛ばす）。
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
      // 段階的描画中は scrollHeight が足りず復元位置が頭打ちになるため、全部入ったら当て直す。
      if (options.restoreScroll !== undefined && container.scrollTop < options.restoreScroll) {
        container.scrollTop = options.restoreScroll;
      }
      if (options.trace === true) mark('T8-all', `${(at - startedAt).toFixed(1)}ms`);
      return at;
    });

    opener.onOpened(meta, { remember: options.remember !== false });

    // 無題の文書は監視に載らない（ディスクに実体が無いため）。
    // 開いているファイルだけを監視する（N-PERF-05）。前のファイルの監視は Rust 側で外れる。
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
 * 開けなかったファイルは履歴から外す。消えたファイルを一覧に残し続けると、
 * 次の起動でも同じ失敗を踏むことになる（03.ux-spec/08-empty-states.md §1 の一覧は道具であって記録ではない）。
 */
export async function openPath(path: string, options: OpenOptions = {}): Promise<OpenOutcome | null> {
  // 編集中の内容を捨てる前に尋ねる（F-EDIT-03）。開くと決まっていないので I/O より前に置く。
  if (options.confirm !== false && !(await confirmDiscard())) return null;

  const startedAt = options.startedAt ?? performance.now();

  let payload: DocumentPayload;
  try {
    payload = await getPlatform().readDocument(path, options.encoding);
  } catch (e) {
    documentStore.notice = { level: 'error', message: describeOpenError(e, path) };
    if (kindOf(e) === 'not-found') config?.onMissing(path);
    return null;
  }

  return openDocument(payload, { resetScroll: true, ...options, startedAt });
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
 * F5 は WebView 自身の「再読み込み」に割り当たっているため、素通しすると `initialization_script` の起動時 bootstrap が再適用され、指定ファイルが再読み込みされてその後に開いたファイルの内容が上書きされてしまう。
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
    // キーごと省く（`exactOptionalPropertyTypes` では `encoding: undefined` と
    // 「指定なし」が別物になる）。
    ...(options.encoding && { encoding: options.encoding }),
    resetScroll: false,
    restoreScroll: container?.scrollTop ?? 0,
    remember: false,
    // 同じ位置を維持する操作であるため履歴に積まない（積むと `Alt+←` が期待どおりに戻らなくなる）。
    history: false,
  });

  // 内容が同じで画面が変化しない場合も、操作を受け付けたことは通知する（3 秒で消える情報通知）。
  if (outcome) notifyInfo(options.notice ?? ja.open.reloaded);
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
