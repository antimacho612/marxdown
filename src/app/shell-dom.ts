import { useDocumentStore } from '@/features/document/store'
import { ja } from '@/i18n/ja'
import { splitPath } from '@/lib/path'

/**
 * React を使わないシェル描画（S8 の比較対象）。
 *
 * `--spike-render=dom` のときに使う。`App.tsx` と**同じ DOM 構造**を素の API で作り、
 * React のマウントコストが Cold Start に占める割合を切り分ける。
 *
 * この経路が成立していること自体が、
 * 「本文が React に依存していない」（ADR-0005）の実証にもなっている。
 */

function el(tag: string, className?: string, text?: string): HTMLElement {
  const node = document.createElement(tag)
  if (className !== undefined) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

export function renderShellWithoutReact(root: HTMLElement): () => void {
  const titlebar = el('header', 'mx-titlebar')
  const name = el('span', 'mx-titlebar__name')
  const dir = el('span', 'mx-titlebar__dir')
  titlebar.append(name, dir)

  const statusbar = el('footer', 'mx-statusbar')
  const left = el('span')
  const spacer = el('span', 'mx-statusbar__spacer')
  const right = el('span')
  statusbar.append(left, spacer, right)

  root.append(titlebar, statusbar)

  const apply = (state: ReturnType<typeof useDocumentStore.getState>) => {
    const meta = state.meta
    name.textContent = meta ? splitPath(meta.path).name : ja.app.name
    dir.textContent = meta ? splitPath(meta.path).dir : ''

    left.textContent = meta
      ? [
          meta.encoding.toUpperCase(),
          meta.eol.toUpperCase(),
          meta.bom ? 'BOM' : null,
          ja.status.bytes(meta.size),
          meta.readonly ? ja.status.readonly : null,
          state.outline.length > 0 ? `見出し ${state.outline.length}` : null,
        ]
          .filter(Boolean)
          .join('  ')
      : ''

    const stats = state.stats
    right.textContent = stats
      ? [
          `${stats.site} / ${stats.strategy}${stats.chunks > 1 ? ` / ${stats.chunks} chunks` : ''}`,
          ja.status.parsedIn(stats.parseMs),
          ja.status.paintedIn(stats.paintMs),
        ].join('  ')
      : ''
  }

  apply(useDocumentStore.getState())
  return useDocumentStore.subscribe(apply)
}
