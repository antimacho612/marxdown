/**
 * アプリシェルのクローム部分。
 *
 * **本文はここに無い**（ADR-0005 / 02.architecture.md §8.1）。
 * React が描くのはタイトルバー・ステータスバー・通知バー・Welcome だけで、
 * `.mx-preview` の中身は `paint.ts` が直接 DOM に入れる。
 *
 * 本文の受け皿（`#mx-preview`）は index.html 側にあり、React の管理下に無い。
 * だから「本文が読める」までに React のコミットを待つ必要がない。
 */
import { useCallback } from 'react'

import { useDocumentStore, type Notice, type NoticeAction } from '@/features/document/store'
import { formatZoom, zoomReset } from '@/features/preview/zoom'
import { useViewStore } from '@/features/view/store'
import { Welcome } from '@/features/workspace/Welcome'
import { ja } from '@/i18n/ja'
import { splitPath } from '@/lib/path'

export function App() {
  const meta = useDocumentStore((s) => s.meta)
  const notice = useDocumentStore((s) => s.notice)

  const { dir, name } = splitPath(meta?.path ?? '')

  return (
    <>
      <header className="mx-titlebar">
        <span className="mx-titlebar__name">{meta ? name : ja.app.name}</span>
        {meta ? <span className="mx-titlebar__dir">{dir}</span> : null}
      </header>

      {notice ? <NoticeBar notice={notice} /> : null}

      {meta ? null : <Welcome />}

      <StatusBar />
    </>
  )
}

/**
 * ステータスバー（03.ux-spec.md §8.3）。
 *
 * ```text
 * Preview   UTF-8  LF   12,345 文字   約 4 分            100%
 * ```
 *
 * §8.3 は「すべての項目がクリック可能」と書いているが、M1 で押せるのは倍率だけ。
 * エンコーディングの再解釈も EOL の変換も M2 以降であり、**押しても何も起きない
 * ものをボタンに見せない**。カーソル位置は Preview では出ない（§8.3 の但し書き）。
 *
 * 計測値（パース / 描画）は開発ビルドでのみ出す。M0 では常時表示していたが、
 * これは開発中の道具であって、製品の画面に居座る理由が説明できない（§11 の不変条件）。
 */
function StatusBar() {
  const meta = useDocumentStore((s) => s.meta)
  const textStats = useDocumentStore((s) => s.textStats)
  const stats = useDocumentStore((s) => s.stats)

  return (
    <footer className="mx-statusbar">
      {meta ? (
        <>
          <span>{ja.status.mode}</span>
          <span>{meta.encoding.toUpperCase()}</span>
          <span>{meta.eol.toUpperCase()}</span>
          {meta.bom ? <span>BOM</span> : null}
          {meta.readonly ? <span>{ja.status.readonly}</span> : null}
          {textStats ? (
            <>
              <span>{ja.status.chars(textStats.chars)}</span>
              <span>{ja.status.readingTime(textStats.readingMinutes)}</span>
            </>
          ) : null}
        </>
      ) : null}

      <span className="mx-statusbar__spacer" />

      {import.meta.env.DEV && stats ? <StatusStats stats={stats} /> : null}
      {meta ? <ZoomIndicator /> : null}
    </footer>
  )
}

/**
 * 表示倍率（F-VIEW-11）。**クリックで等倍に戻る**（§8.3）。
 *
 * 倍率が 100% のときも出しておく。「今は等倍だ」と分かることと、
 * 押せる場所がいつも同じ位置にあることのほうが、1 項目減らすより価値がある。
 */
function ZoomIndicator() {
  const zoom = useViewStore((s) => s.zoom)
  const onClick = useCallback(() => void zoomReset(), [])

  return (
    <button
      type="button"
      className="mx-statusbar__button"
      onClick={onClick}
      title={ja.status.zoomReset}
    >
      {formatZoom(zoom)}
    </button>
  )
}

/**
 * 通知バー（03.ux-spec.md §8.2）。
 *
 * `role` を種別で分けているのは、支援技術に割り込ませるかどうかが変わるため。
 * 情報は `status`（穏やかに読み上げる）、警告とエラーは `alert`（割り込む）。
 */
function NoticeBar({ notice }: { notice: Notice }) {
  const setNotice = useDocumentStore((s) => s.setNotice)
  const dismiss = useCallback(() => setNotice(null), [setNotice])

  return (
    <div
      className={`mx-notice mx-notice--${notice.level}`}
      role={notice.level === 'info' ? 'status' : 'alert'}
    >
      <span className="mx-notice__message">{notice.message}</span>
      {(notice.actions ?? []).map((action) => (
        <NoticeActionButton key={action.label} action={action} onDismiss={dismiss} />
      ))}
      <button
        type="button"
        className="mx-notice__close"
        aria-label={ja.notice.dismiss}
        onClick={dismiss}
      >
        ✕
      </button>
    </div>
  )
}

/**
 * 選択肢を押したら、まず通知を閉じてから実行する。
 *
 * 実行が非同期に終わる（再読み込みなど）場合でも、押した瞬間にバーが消えるほうが
 * 「効いた」ことが伝わる。結果は必要なら新しい通知として出せばよい。
 */
function NoticeActionButton({
  action,
  onDismiss,
}: {
  action: NoticeAction
  onDismiss: () => void
}) {
  const onClick = useCallback(() => {
    onDismiss()
    action.run()
  }, [action, onDismiss])

  return (
    <button type="button" className="mx-notice__action" onClick={onClick}>
      {action.label}
    </button>
  )
}

function StatusStats({
  stats,
}: {
  stats: NonNullable<ReturnType<typeof useDocumentStore.getState>['stats']>
}) {
  return (
    <>
      <span>
        {stats.site}
        {stats.chunks > 1 ? ` / ${stats.chunks} chunks` : ''}
      </span>
      <span>{ja.status.parsedIn(stats.parseMs)}</span>
      <span>{ja.status.paintedIn(stats.paintMs)}</span>
    </>
  )
}
