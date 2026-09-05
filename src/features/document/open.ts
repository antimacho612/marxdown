/**
 * 「ファイルを開く」の唯一の経路。
 *
 * 開く入口は 5 つ（起動時の bootstrap / argv 転送 / ダイアログ / D&D / 相対リンク）あり、個別に実装すると記録漏れやスクロール位置の戻し忘れが入口ごとに起きるため、振る舞いの差はすべて引数で表す。
 * 描いた HTML も Markdown テキストもこの層は保持せず（ADR-0005）、ストアへ渡すのはメタ情報・アウトライン・計測値などの派生値だけである。
 */
import { pushHistory } from '@/features/history/history';
import { scrollToAnchor } from '@/features/preview/anchor';
import { enhance } from '@/features/preview/enhance';
import { paint } from '@/features/preview/paint';
import { forgetRecent, rememberRecent } from '@/features/workspace/recent.svelte';
import { ja } from '@/i18n/ja';
import { toMessage } from '@/lib/error';
import { dirOf } from '@/lib/path';
import { mark } from '@/lib/trace';
import type { MarkdownParser } from '@/markdown/parser';
import { getPlatform, type DocumentPayload, type Encoding } from '@/platform';

import { markClean } from './dirty';
import { confirmDiscard } from './discard';
import { refreshOutline, refreshSearch } from './refresh';
import { documentStore, INFO_NOTICE_MS, notifyInfo, type StoredPayload } from './store.svelte';
import { setDocumentText } from './text';

const PREVIEW_SELECTOR = '#mx-preview';

export interface OpenerConfig {
  parser: MarkdownParser;
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
 * いま注入されているパーサ。**Split の描き直し（`live.ts`）が使う。**
 *
 * 開く経路を通さずにパースしたい場面はここだけで、
 * 他から呼ぶ用途ができたら「開く」の意味を薄めていないか先に疑うこと。
 */
export function getParser(): MarkdownParser | null {
  return config?.parser ?? null;
}

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
   * 描画後に飛ぶページ内アンカー（`./other.md#section` の `#` 以降）。
   *
   * `restoreScroll` と同時に指定しない。位置を「復元する」のと
   * 「指定の見出しへ飛ぶ」のは、どちらか一方しか意味を持たない。
   */
  anchor?: string;
  /**
   * 戻る / 進むの履歴に積むか。既定 true（F-NAV-07）。
   *
   * false にするのは、**同じ場所に居続ける操作**だけ。再読み込み（`F5` /
   * 外部変更）と、履歴そのものを辿る移動（`Alt+←` / `Alt+→`）がそれにあたる。
   */
  history?: boolean;
  /** 起動計測の T6 / T7 / T8 を打つか。コールド起動だけが true。 */
  trace?: boolean;
  /**
   * エンコーディングの**指定**（03.ux-spec/07-status-and-notifications.md §3「クリックで
   * エンコーディング再解釈」）。省略すると Rust 側の推定に任せる。
   *
   * 渡すのは `reinterpret()` だけ（`document/encoding.ts`）。
   */
  encoding?: Encoding;
  /**
   * パースを投げた**直後**、結果を待つ前に呼ばれる。
   *
   * 起動シーケンス（02.architecture/05-startup-sequence.md §1）がシェルを描くための穴。
   * Worker への postMessage はほぼ即座に返るので、ここでの仕事はまるごと
   * パース時間に重なる。この 1 点のためだけに存在する引数。
   */
  betweenParseAndPaint?: () => void;
}

export interface ReloadOptions {
  /**
   * エンコーディングを指定して読み直す（再解釈 / `document/encoding.ts`）。
   *
   * **外部変更による自動再読み込みでは渡さない。** あちらはファイルの中身が
   * 変わったので、推定もやり直すのが正しい。指定が残り続けると、
   * 書き換えられて別のエンコーディングになったファイルを、古い指定で読み続ける。
   */
  encoding?: Encoding;
  /**
   * 読み直した後に出す情報通知の文言。既定は「再読み込みしました」（`F5`）。
   *
   * **文言だけを差し替えられれば足りる。** 自分で押したのか外から変わったのかで
   * 変わるのは「何が起きたか」の説明であって、読み直しの手順ではない。
   */
  notice?: string;
}

export interface OpenOutcome {
  parseMs: number;
  /** 最初のチャンクが見えるまでの経過ミリ秒（`startedAt` 起点）。 */
  paintMs: number;
  chunks: number;
}

/**
 * 本文を手に持っている状態から開く。
 *
 * 起動時の bootstrap 経路がこれを使う。**ファイルを読み直さない**ことが要点で、
 * Rust が WebView 初期化と並行して読んでおいたものを、そのまま使い切る。
 */
export async function openDocument(payload: StoredPayload, options: OpenOptions = {}): Promise<OpenOutcome | null> {
  if (!config) throw new Error('configureOpener が呼ばれていない');

  const startedAt = options.startedAt ?? performance.now();
  // パースを先に投げてから待つ（シェル描画と重ねるため）。
  traceMark(options, 'T6', `${payload.content.length} chars`);
  const parsing = config.parser.parse(payload.content);

  // 本文を差し替える前に、いま読んでいた位置を履歴へ控える（F-NAV-07）。
  // 無題の文書は戻り先として指せないので積まない。
  if (options.history !== false && payload.path !== null) pushHistory(payload.path, previewScrollTop());

  documentStore.meta = payload;

  // 本文はストアではなく素のモジュールへ（ADR-0005 / `document/text.ts`）。
  // エディターが載っていれば CodeMirror の dispatch を伴うため、T6→T7 の並行処理を崩さないようパース送信の後に置く。
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

    // 無題の文書は履歴にも監視にも載らない（ディスクに実体が無いため）。
    if (payload.path !== null) {
      if (options.remember !== false) void rememberRecent(payload.path);
      // 開いているファイルだけを監視する（N-PERF-05）。前のファイルの監視は Rust 側で外れる。
      void watch(payload.path);
    }

    return outcome;
  } catch (e) {
    documentStore.notice = { level: 'error', message: `${ja.error.renderFailed}: ${toMessage(e)}` };
    return null;
  }
}

/**
 * パスから開く。読み込みの失敗もここで面倒を見る。
 *
 * 開けなかったファイルは履歴から外す。消えたファイルを一覧に残し続けると、
 * 次の起動でも同じ失敗を踏むことになる（03.ux-spec/08-empty-states.md §1 の一覧は道具であって記録ではない）。
 */
export async function openPath(path: string, options: OpenOptions = {}): Promise<OpenOutcome | null> {
  // 編集中の内容を捨てる前に尋ねる（F-EDIT-03）。開くと決まっていないので I/O より前に置く。
  if (!(await confirmDiscard())) return null;

  const startedAt = options.startedAt ?? performance.now();

  let payload: DocumentPayload;
  try {
    payload = await getPlatform().readDocument(path, options.encoding);
  } catch (e) {
    documentStore.notice = { level: 'error', message: describeOpenError(e, path) };
    if (kindOf(e) === 'not-found') void forgetRecent(path);
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
 * 落とされたファイルを開く（F-OPEN-08）。
 *
 * 複数落とされても**先頭 1 つだけ**を開く。タブ（M3）が入るまで、
 * 残りを開く先が無いため。黙って捨てずに、その旨を通知する。
 */
export async function openDropped(paths: string[]): Promise<OpenOutcome | null> {
  const first = paths[0];
  if (first === undefined) return null;

  const outcome = await openPath(first);
  if (outcome && paths.length > 1) {
    documentStore.notice = {
      level: 'info',
      message: ja.open.droppedExtra(paths.length - 1),
      autoDismissMs: INFO_NOTICE_MS,
    };
  }
  return outcome;
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
  // 無題の文書（`Ctrl+N`）には読み直す先が無い。F5 は何もしないのが正しい。
  if (meta.path === null) return null;

  const container = document.querySelector<HTMLElement>(PREVIEW_SELECTOR);

  const outcome = await openPath(meta.path, {
    // キーごと省く（`exactOptionalPropertyTypes` では `encoding: undefined` と
    // 「指定なし」が別物になる）。
    ...(options.encoding && { encoding: options.encoding }),
    resetScroll: false,
    restoreScroll: container?.scrollTop ?? 0,
    remember: false,
    // 同じ場所に居続ける操作なので履歴に積まない（積むと `Alt+←` が段階的に効かなくなる）。
    history: false,
  });

  // 内容が同じで画面が動かなくても、操作が届いたことは伝える（3 秒で消える情報通知）。
  if (outcome) notifyInfo(options.notice ?? ja.open.reloaded);
  return outcome;
}

/** 監視の付け替え。失敗しても開く操作は成功しているので握り潰す（`F5` で読み直せる）。 */
async function watch(path: string): Promise<void> {
  try {
    await getPlatform().watchPath(path);
  } catch {
    // 監視できなくても致命的ではない
  }
}

/** いま本文がどこまでスクロールされているか。履歴（F-NAV-07）が控える値。 */
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

/** Rust の `CoreError` を日本語の 1 行に落とす。 */
export function describeOpenError(e: unknown, path: string): string {
  const kind = kindOf(e);
  if (kind !== null) {
    const entry = (ja.error as Record<string, unknown>)[kind];
    if (typeof entry === 'function') return (entry as (p: string) => string)(path);
    if (typeof entry === 'string') return entry;
  }
  return toMessage(e);
}
