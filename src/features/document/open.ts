/**
 * 「ファイルを開く」の唯一の経路。
 *
 * # なぜ 1 本にまとめるのか
 *
 * M1 の時点で、開く入口は 5 つある。
 *
 * ```text
 * 起動時の bootstrap            → openDocument（本文が既に手元にある）
 * 別インスタンスからの argv 転送 → openPath
 * ファイルダイアログ (Ctrl+O)   → openPath
 * ドラッグ＆ドロップ            → openPath
 * 本文中の相対リンク（M1 後半） → openPath
 * ```
 *
 * 入口ごとに「読む → パース → 描く → 派生状態を更新する」を書くと、
 * 最近開いたファイルへの記録漏れ、スクロール位置の戻し忘れ、通知の消し忘れが
 * 入口の数だけ起きる。**振る舞いの差は引数で表す**。
 *
 * # ここに本文を残さない
 *
 * 描き終えた HTML も Markdown テキストも、この層は保持しない（ADR-0005）。
 * ストアへ渡すのはメタ情報・アウトライン・計測値といった派生値だけ。
 */
import { mark } from '@/app/trace'
import { enhance } from '@/features/preview/enhance'
import { paint } from '@/features/preview/paint'
import { forgetRecent, rememberRecent } from '@/features/workspace/recent'
import { ja } from '@/i18n/ja'
import { dirOf } from '@/lib/path'
import type { MarkdownParser } from '@/markdown/worker/client'
import { getPlatform, type DocumentPayload } from '@/platform'

import { INFO_NOTICE_MS, useDocumentStore } from './store'

const PREVIEW_SELECTOR = '#mx-preview'

export interface OpenerConfig {
  parser: MarkdownParser
  /** S7: 段階的描画を使うか。 */
  progressive: boolean
  /** S3: パース場所。ステータスバーの表示に使う。 */
  site: 'worker' | 'main'
  /** S7 の表示名。 */
  strategy: 'progressive' | 'bulk'
}

let config: OpenerConfig | null = null

/**
 * パーサとスパイク設定を渡す。起動時に 1 回だけ呼ぶ。
 *
 * 開く側（ダイアログ / D&D / リンク）がパーサの存在を知らずに済むようにするための注入。
 */
export function configureOpener(next: OpenerConfig): void {
  config = next
}

export interface OpenOptions {
  /**
   * 経過時間の起点。既定は「読み込みを始めた時刻」。
   * ウォーム起動では argv 転送を受けた時刻を渡し、転送からの実時間を測る。
   */
  startedAt?: number
  /** 先頭までスクロールを戻すか。起動直後は既に先頭なので不要。 */
  resetScroll?: boolean
  /** 最近開いたファイルに積むか。既定 true。 */
  remember?: boolean
  /** 起動計測の T6 / T7 / T8 を打つか。コールド起動だけが true。 */
  trace?: boolean
  /**
   * パースを投げた**直後**、結果を待つ前に呼ばれる。
   *
   * 起動シーケンス（02.architecture.md §5.1）がシェルを描くための穴。
   * Worker への postMessage はほぼ即座に返るので、ここでの仕事はまるごと
   * パース時間に重なる。この 1 点のためだけに存在する引数。
   */
  betweenParseAndPaint?: () => void
}

export interface OpenOutcome {
  parseMs: number
  /** 最初のチャンクが見えるまでの経過ミリ秒（`startedAt` 起点）。 */
  paintMs: number
  chunks: number
}

/**
 * 本文を手に持っている状態から開く。
 *
 * 起動時の bootstrap 経路がこれを使う。**ファイルを読み直さない**ことが要点で、
 * Rust が WebView 初期化と並行して読んでおいたものを、そのまま使い切る。
 */
export async function openDocument(
  payload: DocumentPayload,
  options: OpenOptions = {},
): Promise<OpenOutcome | null> {
  if (!config) throw new Error('configureOpener が呼ばれていない')

  const startedAt = options.startedAt ?? performance.now()
  const store = useDocumentStore.getState()

  // パースを先に投げる。待つのは後。
  traceMark(options, 'T6', `${payload.content.length} chars`)
  const parsing = config.parser.parse(payload.content, { progressive: config.progressive })

  store.setMeta(payload)
  options.betweenParseAndPaint?.()

  try {
    const parsed = await parsing
    traceMark(options, 'T7', `${parsed.chunks.length} chunks, parse=${parsed.parseMs.toFixed(1)}ms`)

    const container = document.querySelector<HTMLElement>(PREVIEW_SELECTOR)
    if (!container) throw new Error(`${PREVIEW_SELECTOR} が見つからない`)

    const result = paint(container, parsed.chunks, parsed.frontMatter)
    if (options.resetScroll === true) container.scrollTop = 0

    store.setOutline(parsed.outline)
    store.setFrontMatter(parsed.frontMatter)
    store.setTextStats(parsed.textStats)
    store.setNotice(null)

    // 「読める」瞬間は DOM 挿入の完了ではなく**次のフレーム**。
    // DOM に入れただけでは、まだ一度も描かれていない（05.performance-budget.md §5.2）。
    await nextFrame()
    traceMark(options, 'T8')

    const outcome: OpenOutcome = {
      parseMs: parsed.parseMs,
      paintMs: result.firstChunkAt - startedAt,
      chunks: parsed.chunks.length,
    }
    store.setStats({ ...outcome, site: config.site, strategy: config.strategy })

    // 本文に後から手を入れる（画像 / コピーボタン / ハイライト）。
    //
    // T8 の**後**に置くのが要点。どれも読み始めるのに要らない仕事であり、
    // 手前に置くと「本文が読める」までの時間がそのぶん伸びる。
    //
    // 段階的描画では最初のチャンクしかまだ DOM に無い。まず見えているぶんを
    // 直し、残りが入り終わったらもう一度呼ぶ（`enhance` は処理済みを飛ばす）。
    const enhanceOptions = { baseDir: dirOf(payload.path) }
    enhance(container, enhanceOptions)

    // 検索が開いていれば、新しい本文で引き直す（閉じない理由は `search.ts`）。
    searchRefresher?.()

    // 残りのチャンクは idle で入る。ここでは待たない。
    void result.done.then((at) => {
      enhance(container, enhanceOptions)
      if (options.trace === true) mark('T8-all', `${(at - startedAt).toFixed(1)}ms`)
      return at
    })

    // 履歴への記録は本文が見えた**後**。IPC 1 回ぶんでも T8 の手前に置かない。
    if (options.remember !== false) void rememberRecent(payload.path)

    return outcome
  } catch (e) {
    store.setNotice({ level: 'error', message: `${ja.error.renderFailed}: ${toMessage(e)}` })
    return null
  }
}

/**
 * パスから開く。読み込みの失敗もここで面倒を見る。
 *
 * 開けなかったファイルは履歴から外す。消えたファイルを一覧に残し続けると、
 * 次の起動でも同じ失敗を踏むことになる（03.ux-spec.md §9.1 の一覧は道具であって記録ではない）。
 */
export async function openPath(
  path: string,
  options: OpenOptions = {},
): Promise<OpenOutcome | null> {
  const startedAt = options.startedAt ?? performance.now()

  let payload: DocumentPayload
  try {
    payload = await getPlatform().readDocument(path)
  } catch (e) {
    useDocumentStore.getState().setNotice({ level: 'error', message: describeOpenError(e, path) })
    if (kindOf(e) === 'not-found') void forgetRecent(path)
    return null
  }

  return openDocument(payload, { resetScroll: true, ...options, startedAt })
}

/** ダイアログから開く（F-OPEN-07）。取り消されたら何もしない。 */
export async function openViaDialog(): Promise<OpenOutcome | null> {
  const picked = await getPlatform().pickFile()
  if (picked === null) return null
  return openPath(picked)
}

/**
 * 落とされたファイルを開く（F-OPEN-08）。
 *
 * 複数落とされても M1 では**先頭 1 つだけ**を開く。タブは M3 の担当なので、
 * 残りを開く先がまだ無い。黙って捨てずに、その旨を通知する。
 */
export async function openDropped(paths: string[]): Promise<OpenOutcome | null> {
  const first = paths[0]
  if (first === undefined) return null

  const outcome = await openPath(first)
  if (outcome && paths.length > 1) {
    useDocumentStore.getState().setNotice({
      level: 'info',
      message: ja.open.droppedExtra(paths.length - 1),
      autoDismissMs: INFO_NOTICE_MS,
    })
  }
  return outcome
}

/**
 * 検索モジュールが自分を登録する口（F-VIEW-10）。
 *
 * ここから `import('@/features/preview/search')` を呼ぶわけにはいかない。
 * 呼べば、検索を一度も使っていないユーザーのためにも `search` チャンクを
 * 落とすことになる。**読み込まれたモジュールのほうから名乗り出る**形にする。
 */
let searchRefresher: (() => void) | null = null

export function registerSearchRefresher(refresh: () => void): void {
  searchRefresher = refresh
}

function traceMark(options: OpenOptions, id: string, note?: string): void {
  if (options.trace !== true) return
  if (note === undefined) mark(id)
  else mark(id, note)
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve())
  })
}

function kindOf(e: unknown): string | null {
  if (typeof e === 'object' && e !== null && 'kind' in e) {
    return String((e as { kind: unknown }).kind)
  }
  return null
}

/** Rust の `CoreError` を日本語の 1 行に落とす。 */
export function describeOpenError(e: unknown, path: string): string {
  const kind = kindOf(e)
  if (kind !== null) {
    const entry = (ja.error as Record<string, unknown>)[kind]
    if (typeof entry === 'function') return (entry as (p: string) => string)(path)
    if (typeof entry === 'string') return entry
  }
  return toMessage(e)
}

function toMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  if (typeof e === 'object' && e !== null && 'message' in e)
    return String((e as { message: unknown }).message)
  return String(e)
}
