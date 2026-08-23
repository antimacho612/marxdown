/**
 * 引数なしで起動したときの画面（F-OPEN-03 / F-OPEN-09 / 03.ux-spec.md §9.1）。
 *
 * ```text
 * Marxdown
 *
 * ファイルを開く          Ctrl+O
 *
 * 最近開いたファイル
 *   README.md            ~/repos/marxdown
 *   00.design-brief.md   ~/repos/marxdown/docs.local
 *
 * ここに Markdown ファイルをドロップ
 * ```
 *
 * チュートリアルもツアーも出さない。**ショートカットを併記することが唯一の教育**。
 *
 * 「フォルダを開く」（M3）と「新規ファイル」（M2）はまだ並べていない。
 * 押しても何も起きない項目を置くのは Principle 3 に反する。
 */
import { useCallback } from 'react'

import { openPath, openViaDialog } from '@/features/document/open'
import { ja } from '@/i18n/ja'
import { splitPath } from '@/lib/path'
import type { RecentEntry } from '@/platform'

import { useRecentStore } from './recent'

export function Welcome() {
  const entries = useRecentStore((s) => s.entries)

  const onOpen = useCallback(() => {
    void openViaDialog()
  }, [])

  return (
    <div className="mx-welcome">
      <div className="mx-welcome__panel">
        <h1 className="mx-welcome__title">{ja.welcome.title}</h1>

        <button type="button" className="mx-welcome__action" onClick={onOpen}>
          <span>{ja.welcome.openFile}</span>
          <kbd>Ctrl+O</kbd>
        </button>

        <section className="mx-welcome__recent">
          <h2 className="mx-welcome__heading">{ja.welcome.recent}</h2>
          {entries.length === 0 ? (
            <p className="mx-welcome__empty">{ja.welcome.noRecent}</p>
          ) : (
            <ul className="mx-welcome__list">
              {entries.slice(0, RECENT_SHOWN).map((entry) => (
                <RecentItem key={entry.path} entry={entry} />
              ))}
            </ul>
          )}
        </section>

        <p className="mx-welcome__hint">{ja.welcome.dropHint}</p>
        <p className="mx-welcome__hint">
          <code>{ja.welcome.cliHint}</code>
        </p>
      </div>
    </div>
  )
}

/**
 * 一覧に出す件数。ストアはもっと保持している（`store.rs` の `RECENT_LIMIT`）。
 *
 * 少なく見せるのは意図的で、§9.1 のスケッチも 3 件。
 * ここが長い一覧になった瞬間、Welcome 画面は「履歴ビューア」という別の道具になる。
 */
const RECENT_SHOWN = 6

function RecentItem({ entry }: { entry: RecentEntry }) {
  const { dir, name } = splitPath(entry.path)

  const onClick = useCallback(() => {
    // 開けなかった場合の通知と履歴からの除去は `openPath` の担当。
    void openPath(entry.path)
  }, [entry.path])

  return (
    <li>
      <button type="button" className="mx-welcome__item" onClick={onClick} title={entry.path}>
        <span className="mx-welcome__item-name">{name}</span>
        <span className="mx-welcome__item-dir">{dir}</span>
      </button>
    </li>
  )
}
