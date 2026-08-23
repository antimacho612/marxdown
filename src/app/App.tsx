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
import { useDocumentStore } from '@/features/document/store'
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

      {notice ? (
        <div className={`mx-notice mx-notice--${notice.level}`} role="status">
          {notice.message}
        </div>
      ) : null}

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
