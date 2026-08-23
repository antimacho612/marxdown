/**
 * アプリシェルのクローム部分。
 *
 * **本文はここに無い**（ADR-0005 / 02.architecture.md §8.1）。
 * React が描くのはタイトルバー・ステータスバー・通知バー・Welcome だけで、
 * `.mx-preview` の中身は `paint.ts` が直接 DOM に入れる。
 *
 * この構造は S8（React マウントコストが起動時間に占める割合）を
 * 切り分け可能にするためでもある。React を外しても本文は同じ経路で出る
 * （`shell-dom.ts` が同じ DOM を作る）。
 */
import { useCallback } from 'react'

import { useDocumentStore, type Notice, type NoticeAction } from '@/features/document/store'
import { ja } from '@/i18n/ja'

export function App() {
  const meta = useDocumentStore((s) => s.meta)
  const notice = useDocumentStore((s) => s.notice)
  const stats = useDocumentStore((s) => s.stats)
  const outline = useDocumentStore((s) => s.outline)

  const { dir, name } = splitPath(meta?.path ?? '')

  return (
    <>
      <header className="mx-titlebar">
        <span className="mx-titlebar__name">{meta ? name : ja.app.name}</span>
        {meta ? <span className="mx-titlebar__dir">{dir}</span> : null}
      </header>

      {notice ? <NoticeBar notice={notice} /> : null}

      {meta ? null : (
        <div className="mx-welcome">
          <p className="mx-welcome__title">{ja.welcome.title}</p>
          <p>{ja.welcome.hint}</p>
        </div>
      )}

      <footer className="mx-statusbar">
        {meta ? (
          <>
            <span>{meta.encoding.toUpperCase()}</span>
            <span>{meta.eol.toUpperCase()}</span>
            {meta.bom ? <span>BOM</span> : null}
            <span>{ja.status.bytes(meta.size)}</span>
            {meta.readonly ? <span>{ja.status.readonly}</span> : null}
            {outline.length > 0 ? <span>見出し {outline.length}</span> : null}
          </>
        ) : null}
        <span className="mx-statusbar__spacer" />
        {stats ? <StatusStats stats={stats} /> : null}
      </footer>
    </>
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
        {stats.site} / {stats.strategy}
        {stats.chunks > 1 ? ` / ${stats.chunks} chunks` : ''}
      </span>
      <span>{ja.status.parsedIn(stats.parseMs)}</span>
      <span>{ja.status.paintedIn(stats.paintMs)}</span>
    </>
  )
}

/** パスをディレクトリとファイル名に割る。Windows と POSIX の両方を受ける。 */
export function splitPath(path: string): { dir: string; name: string } {
  const index = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'))
  if (index < 0) return { dir: '', name: path }
  return { dir: path.slice(0, index), name: path.slice(index + 1) }
}
