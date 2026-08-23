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
 *
 * この重ね合わせは `openDocument` の `betweenParseAndPaint` として表現してある。
 * 開く経路そのものは `features/document/open.ts` に 1 本化されており、
 * このファイルに残るのは**起動に固有の仕事**（bootstrap の読み取り、
 * ウィンドウの表示、購読の登録）だけ。
 */
import {
  configureOpener,
  openDocument,
  openDropped,
  openPath,
  openViaDialog,
} from '@/features/document/open'
import { useDocumentStore } from '@/features/document/store'
import { applyZoom, zoomIn, zoomOut, zoomReset } from '@/features/preview/zoom'
import { useRecentStore } from '@/features/workspace/recent'
import { ja } from '@/i18n/ja'
import { createParser } from '@/markdown/worker/client'
import { getPlatform, type Bootstrap, type DocumentPayload, type SpikeFlags } from '@/platform'

import { bindKeys } from './shortcuts'
import { adoptT4, drain, initTrace, isTracing, mark } from './trace'

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

  // 倍率は**本文を描くより前**に当てる（F-VIEW-11）。
  // 後から当てると、既定倍率で 1 フレーム描かれてから跳ねる。
  applyZoom(bootstrap?.zoom ?? 1, false)
  useRecentStore.getState().setEntries(bootstrap?.recent ?? [])

  configureOpener({
    parser: createParser(spike.parse),
    progressive: spike.paint === 'progressive',
    site: spike.parse,
    strategy: spike.paint,
  })

  // シェルは、本文があってもなくても同じ場所で描く。
  // 本文がある場合は `openDocument` がパース送信の直後に呼び出す。
  let shellRendered = false
  const renderShellOnce = () => {
    if (shellRendered) return
    shellRendered = true
    renderShell(spike)
  }

  const initial = await resolveInitialDocument(bootstrap)

  if (initial) {
    await openDocument(initial, {
      trace: true,
      betweenParseAndPaint: () => {
        renderShellOnce()
        reportStartupProblems(bootstrap)
      },
    })
  } else {
    renderShellOnce()
    reportStartupProblems(bootstrap)
  }

  // --- ウィンドウを見せる -------------------------------------------------
  // 04.tech-stack.md §9.1: 最初に見えるフレームが既に本文である状態を作る。
  if (isTracing()) await platform.reportTrace(drain())
  await platform.ready()

  // --- 以降は非同期 -------------------------------------------------------
  // ウィンドウが見えた後に回す。購読とキーバインドの登録は
  // 「本文が読める」瞬間に間に合う必要がない仕事であり、T8 より前に置く理由がない。
  installShortcuts()
  installOpenRequestHandler()
  installDragAndDrop()
}

/**
 * 起動時に開くべき本文を確定させる。
 *
 * 通常は bootstrap に本文ごと載っている。載っていないのは 2 つの場合だけで、
 * どちらも IPC 往復が 1 回増える。
 *
 * - 256KB 超のファイル（初期化スクリプトに埋め込むと文字列化コストが往復を上回る）
 * - S2 の `--spike-bootstrap=invoke`（往復コストを測るための比較経路）
 */
async function resolveInitialDocument(
  bootstrap: Bootstrap | null,
): Promise<DocumentPayload | null> {
  const doc = bootstrap?.document ?? null

  if (doc?.content !== null && doc?.content !== undefined) {
    return { ...doc, content: doc.content }
  }

  if (doc) {
    try {
      return await getPlatform().readDocument(doc.path)
    } catch (e) {
      useDocumentStore.getState().setNotice({ level: 'error', message: toMessage(e) })
      return null
    }
  }

  if (bootstrap?.spike.bootstrap === 'invoke') {
    const late = await getPlatform().takeBootstrap()
    const lateDoc = late?.document
    if (lateDoc?.content !== null && lateDoc?.content !== undefined) {
      return { ...lateDoc, content: lateDoc.content }
    }
  }

  return null
}

/**
 * CLI 引数まわりの問題を通知バーに出す。
 *
 * 本文の描画とは独立なので、シェルが描かれた直後（= 見える最初のフレーム）に流す。
 */
function reportStartupProblems(bootstrap: Bootstrap | null): void {
  const store = useDocumentStore.getState()

  if (bootstrap?.documentError) {
    const e = bootstrap.documentError
    store.setNotice({ level: 'error', message: describeError(e.kind, e.path, e.message) })
  }
  if (bootstrap && bootstrap.unknownArgs.length > 0) {
    store.setNotice({ level: 'warning', message: ja.error.unknownArgs(bootstrap.unknownArgs) })
  }
}

/**
 * M1 のグローバルキーバインド（03.ux-spec.md §5.3）。
 *
 * ここに並ぶのは**アプリ全体で効くもの**だけ。プレビュー内検索のように
 * 遅延ロードされる機能は、自分のモジュールの中で `bindKeys` する。
 */
function installShortcuts(): void {
  bindKeys([
    { key: 'Ctrl+O', run: () => void openViaDialogSafely() },
    { key: 'Ctrl+=', run: () => void zoomIn() },
    { key: 'Ctrl+-', run: () => void zoomOut() },
    { key: 'Ctrl+0', run: () => void zoomReset() },
  ])
}

/**
 * ダイアログを開く（F-OPEN-07）。
 *
 * ダイアログ自体の失敗（プラットフォーム側の異常）は通知に出す。
 * 「取り消した」は失敗ではないので何も出さない。
 */
async function openViaDialogSafely(): Promise<void> {
  try {
    await openViaDialog()
  } catch (e) {
    useDocumentStore.getState().setNotice({ level: 'error', message: toMessage(e) })
  }
}

/**
 * 別インスタンスからの起動要求（ウォーム起動 / S6）。
 *
 * ここには WebView の初期化も、バンドルの評価も、React のマウントも存在しない。
 * **Worker が既に温まっており、パースだけが仕事になる**（02.architecture.md §5.2）。
 *
 * M1 では「タブを増やす」のではなく現在の本文を置き換える。
 * タブは M3 の担当であり、S6 が測りたいのは転送 → 描画の時間だから。
 */
function installOpenRequestHandler(): void {
  const platform = getPlatform()

  platform.onOpenRequest((req) => {
    const path = req.paths[0]
    if (path === undefined) return

    const warmStart = performance.now()
    void openPath(path, { startedAt: warmStart }).then(async (outcome) => {
      if (!outcome) return outcome

      // ウォーム起動の実測値（S6）。
      // Rust 側は argv 転送を受けた瞬間から測っており、こちらはイベント受信から
      // 測っている。両方を記録して差分も見えるようにする。
      const fromEvent = performance.now() - warmStart
      await platform.warmDone(
        req.requestId,
        path,
        `fromEvent=${fromEvent.toFixed(1)}ms parse=${outcome.parseMs.toFixed(1)}ms chunks=${outcome.chunks}`,
      )
      return outcome
    })
  })
}

/**
 * ウィンドウへのドラッグ＆ドロップ（F-OPEN-08）。
 *
 * ドロップ先の見た目は `data-mx-dragover` 属性 1 つで表す。React を通さないのは、
 * ドラッグ中は毎フレーム `over` が飛んでくるため（ADR-0005 と同じ判断）。
 */
function installDragAndDrop(): void {
  const root = document.documentElement

  getPlatform().onDragDrop((event) => {
    if (event.type === 'over') {
      root.dataset['mxDragover'] = 'true'
      return
    }

    delete root.dataset['mxDragover']
    if (event.type !== 'drop') return

    void openDropped(event.paths)
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
