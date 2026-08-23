import { useDocumentStore } from '@/features/document/store'
/**
 * 起動シーケンス（02.architecture.md §5.1）。
 *
 * Marxdown で最も重要な経路。ここを 1 本の細い線に保つことが
 * Principle 1「Open Fast」の実装そのもの。
 *
 * ```text
 * T4  初期スクリプト評価開始          （Rust の initialization_script が打つ）
 * T5  bootstrap を同期読み取り        （IPC 往復なし）
 * T6  Worker へ parse を送信          （シェル描画より先に投げる）
 * ─── ここでシェルを描く。Worker は並行に働いている ───
 * T7  Worker から HTML 受信
 * T8  本文 DOM 挿入完了 + 次の rAF     ← 「読める」瞬間
 * T9  window.show()
 * ```
 *
 * # 順序の理由
 *
 * `parse` の送信を**シェル描画より前**に置いているのが要点。
 * Worker への postMessage はほぼ即座に返るので、送信を先に済ませておけば
 * シェルの描画時間がまるごとパース時間に重なる。
 */
import { paint } from '@/features/preview/paint'
import { ja } from '@/i18n/ja'
import { createParser, type MarkdownParser } from '@/markdown/worker/client'
import { getPlatform, type Bootstrap, type SpikeFlags } from '@/platform'

import { adoptT4, drain, initTrace, isTracing, mark } from './trace'

export interface StartupContext {
  bootstrap: Bootstrap
  parser: MarkdownParser
  spike: SpikeFlags
  /** シェルを描く。呼び出し側（main.tsx）が React / DOM を選ぶ。 */
  renderShell: () => void
}

const PREVIEW_SELECTOR = '#mx-preview'

/** `--spike-render` の既定。bootstrap が取れない場合の保険。 */
const FALLBACK_SPIKE: SpikeFlags = {
  bootstrap: 'script',
  parse: 'worker',
  paint: 'progressive',
  render: 'react',
}

/**
 * bootstrap を読む。**同期的に読めることが最重要**（§5.1 の要点 2）。
 *
 * `invoke()` の往復を待つと、WebView 準備完了 → リクエスト → レスポンスという
 * 最低 1 ラウンドトリップが本文表示前に挟まる。
 */
export function readBootstrap(): Bootstrap | null {
  return getPlatform().getBootstrap()
}

export async function startup(renderShell: (spike: SpikeFlags) => void): Promise<void> {
  const platform = getPlatform()

  const bootstrap = readBootstrap()
  initTrace(bootstrap?.trace ?? null)
  adoptT4()
  mark('T5', bootstrap?.document ? `${bootstrap.document.size} bytes` : 'no document')

  const spike = bootstrap?.spike ?? FALLBACK_SPIKE
  const store = useDocumentStore.getState()

  // --- 本文の取得 -----------------------------------------------------
  // 256KB 超、または S2 の invoke 経路では bootstrap に本文が入っていない。
  let doc = bootstrap?.document ?? null
  let content = doc?.content ?? null

  const parser = createParser(spike.parse)

  // --- Worker へ投げる（シェル描画より先） ------------------------------
  let parsing: ReturnType<MarkdownParser['parse']> | null = null
  if (content !== null) {
    mark('T6', `${content.length} chars`)
    parsing = parser.parse(content, { progressive: spike.paint === 'progressive' })
  }

  // --- シェルを描く。Worker は並行に働いている -------------------------
  if (doc) store.setMeta(doc)
  renderShell(spike)

  if (bootstrap?.documentError) {
    const e = bootstrap.documentError
    store.setNotice({ level: 'error', message: describeError(e.kind, e.path, e.message) })
  }
  if (bootstrap && bootstrap.unknownArgs.length > 0) {
    store.setNotice({ level: 'warning', message: ja.error.unknownArgs(bootstrap.unknownArgs) })
  }

  // --- 本文が bootstrap に無かった場合の遅延取得 -----------------------
  if (content === null && doc) {
    try {
      const payload = await platform.readDocument(doc.path)
      content = payload.content
      doc = { ...payload, content: payload.content }
      store.setMeta(payload)
      mark('T6', `${content.length} chars (deferred)`)
      parsing = parser.parse(content, { progressive: spike.paint === 'progressive' })
    } catch (e) {
      store.setNotice({ level: 'error', message: toMessage(e) })
    }
  } else if (content === null && !doc && bootstrap?.spike.bootstrap === 'invoke') {
    // S2 の invoke 経路で、bootstrap ごと取りに行くケース
    const late = await platform.takeBootstrap()
    if (late?.document?.content !== null && late?.document?.content !== undefined) {
      content = late.document.content
      store.setMeta(late.document)
      mark('T6', `${content.length} chars (invoke)`)
      parsing = parser.parse(content, { progressive: spike.paint === 'progressive' })
    }
  }

  // --- 描画 -------------------------------------------------------------
  if (parsing) {
    try {
      const parsed = await parsing
      mark('T7', `${parsed.chunks.length} chunks, parse=${parsed.parseMs.toFixed(1)}ms`)

      const container = document.querySelector<HTMLElement>(PREVIEW_SELECTOR)
      if (!container) throw new Error(`${PREVIEW_SELECTOR} が見つからない`)

      const paintStarted = performance.now()
      const result = paint(container, parsed.chunks, parsed.frontMatter)

      store.setOutline(parsed.outline)
      store.setFrontMatter(parsed.frontMatter)

      // T8 は「本文 DOM 挿入完了 + 次の rAF」。
      // DOM に入れただけでは描かれていない。次のフレームまで待って初めて
      // 「読める」と言える（05.performance-budget.md §5.2）。
      await nextFrame()
      mark('T8')

      store.setStats({
        parseMs: parsed.parseMs,
        paintMs: result.firstChunkAt - paintStarted,
        chunks: parsed.chunks.length,
        site: spike.parse,
        strategy: spike.paint,
      })

      // 残りのチャンクは idle で入る。ここでは待たない。
      void result.done.then((at) => {
        if (isTracing()) mark('T8-all', `${(at - paintStarted).toFixed(1)}ms`)
        return at
      })
    } catch (e) {
      store.setNotice({ level: 'error', message: `${ja.error.renderFailed}: ${toMessage(e)}` })
    }
  }

  // --- ウィンドウを見せる -------------------------------------------------
  // 04.tech-stack.md §9.1: 最初に見えるフレームが既に本文である状態を作る。
  if (isTracing()) await platform.reportTrace(drain())
  await platform.ready()

  // --- 以降は非同期 -------------------------------------------------------
  installOpenRequestHandler(parser, spike)
}

/**
 * 別インスタンスからの起動要求（ウォーム起動 / S6）。
 *
 * ここには WebView の初期化も、バンドルの評価も、React のマウントも存在しない。
 * **Worker が既に温まっており、パースだけが仕事になる**（02.architecture.md §5.2）。
 *
 * M0 では「タブを増やす」のではなく現在の本文を置き換える。
 * タブは M3 の担当であり、S6 が測りたいのは転送 → 描画の時間だから。
 */
function installOpenRequestHandler(parser: MarkdownParser, spike: SpikeFlags): void {
  const platform = getPlatform()
  const store = useDocumentStore.getState()

  platform.onOpenRequest((req) => {
    const path = req.paths[0]
    if (path === undefined) return

    const warmStart = performance.now()
    void (async () => {
      try {
        const payload = await platform.readDocument(path)
        const parsed = await parser.parse(payload.content, {
          progressive: spike.paint === 'progressive',
        })
        const container = document.querySelector<HTMLElement>(PREVIEW_SELECTOR)
        if (!container) return

        const result = paint(container, parsed.chunks, parsed.frontMatter)
        container.scrollTop = 0

        store.setMeta(payload)
        store.setOutline(parsed.outline)
        store.setFrontMatter(parsed.frontMatter)
        store.setNotice(null)

        // ここが「本文が読める」瞬間。DOM に入れただけでは描かれていないので、
        // コールド起動の T8 と同じく次のフレームまで待つ。
        await nextFrame()

        store.setStats({
          parseMs: parsed.parseMs,
          paintMs: result.firstChunkAt - warmStart,
          chunks: parsed.chunks.length,
          site: spike.parse,
          strategy: spike.paint,
        })

        // ウォーム起動の実測値（S6）。
        // Rust 側は argv 転送を受けた瞬間から測っており、こちらは
        // イベント受信から測っている。両方を記録して差分も見えるようにする。
        const fromEvent = performance.now() - warmStart
        await platform.warmDone(
          req.requestId,
          path,
          `fromEvent=${fromEvent.toFixed(1)}ms parse=${parsed.parseMs.toFixed(1)}ms chunks=${parsed.chunks.length}`,
        )
      } catch (e) {
        store.setNotice({ level: 'error', message: toMessage(e) })
      }
    })()
  })
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve())
  })
}

function describeError(kind: string, path: string, fallback: string): string {
  const table = ja.error as Record<string, unknown>
  const entry = table[kind]
  if (typeof entry === 'function') return (entry as (p: string) => string)(path)
  if (typeof entry === 'string') return entry
  return fallback
}

function toMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  if (typeof e === 'object' && e !== null && 'message' in e)
    return String((e as { message: unknown }).message)
  return String(e)
}
