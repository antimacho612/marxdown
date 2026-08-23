/**
 * S4 / S5 のスパイク画面。
 *
 * - S4: `@replit/codemirror-vscode-keymap` の VS Code 互換キーマップの実力
 * - S5: `livePreview()` の装飾で WYSIWYG がどこまで書けるか
 *
 * **この 2 つは手で触らないと判断できない。** 数値ではなく感触が判定基準なので、
 * 触れる状態を作るところまでがこのファイルの責務。
 *
 * `?spike=editor` で開く。動的 import なので `main` チャンクには載らない。
 */
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { bracketMatching, defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { search, searchKeymap } from '@codemirror/search'
import { EditorState } from '@codemirror/state'
import {
  EditorView,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
} from '@codemirror/view'
import { vscodeKeymap } from '@replit/codemirror-vscode-keymap'

import { livePreview } from '@/features/editor/live-preview/decorations'

const SAMPLE = `# S4 / S5 スパイク

カーソルをこの行に置くと、**記法が表示される**はず。
別の行に移すと \`**\` が消えて太字だけが残る。

## VS Code 互換キーマップの確認項目 (S4)

- Ctrl+D で次の同じ語を選択（マルチカーソル）
- Alt+Click でカーソル追加
- Alt+↑ / Alt+↓ で行の移動
- Shift+Alt+↓ で行の複製
- Ctrl+Shift+K で行削除
- Ctrl+/ でコメントトグル
- Ctrl+F / Ctrl+H で検索・置換
- Home / End、Ctrl+Home / Ctrl+End
- Ctrl+] / Ctrl+[ でインデント

### 日本語入力の確認 (S5 の最大リスク)

ここで日本語をタイプして、変換中に装飾がちらつかないか見る。
**強調**や*斜体*を含む行で変換したときが本番。

\`\`\`ts
// コードブロックは装飾しない（M0 のスコープ外）
const x: number = 1
\`\`\`

> 引用も M0 では装飾しない。見出しと強調だけ。

| 表は | 装飾しない |
| --- | --- |
| 等幅のまま | 整形表示する |
`

function createEditor(parent: HTMLElement, useLivePreview: boolean): EditorView {
  return new EditorView({
    parent,
    state: EditorState.create({
      doc: SAMPLE,
      extensions: [
        lineNumbers(),
        history(),
        drawSelection(),
        dropCursor(),
        rectangularSelection(),
        highlightActiveLine(),
        highlightSpecialChars(),
        bracketMatching(),
        search({ top: true }),
        EditorState.allowMultipleSelections.of(true),
        markdown({ base: markdownLanguage }),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        // vscodeKeymap を先に置く。後段の defaultKeymap と衝突したときは先勝ち。
        keymap.of([
          ...vscodeKeymap,
          ...searchKeymap,
          ...historyKeymap,
          ...defaultKeymap,
          indentWithTab,
        ]),
        EditorView.lineWrapping,
        EditorView.theme({
          '&': { height: '100%', fontSize: '15px' },
          '.cm-scroller': { fontFamily: 'var(--mx-font-code)', lineHeight: '1.7' },
          '.cm-content': { maxWidth: '80ch', margin: '0 auto', padding: '24px 0 40vh' },
        }),
        ...(useLivePreview ? [livePreview()] : []),
      ],
    }),
  })
}

export function mountEditorSpike(container: HTMLElement): () => void {
  container.replaceChildren()
  container.style.display = 'grid'
  container.style.gridTemplateRows = 'auto 1fr'
  container.style.height = '100%'

  const bar = document.createElement('div')
  bar.style.cssText =
    'display:flex;gap:12px;align-items:center;padding:8px 16px;border-bottom:1px solid var(--mx-color-border-subtle);background:var(--mx-color-bg-subtle);font-size:13px'

  const label = document.createElement('label')
  label.style.cssText = 'display:flex;gap:6px;align-items:center;cursor:pointer'
  const toggle = document.createElement('input')
  toggle.type = 'checkbox'
  toggle.checked = true
  label.append(toggle, document.createTextNode('Live Preview の装飾 (S5)'))

  const note = document.createElement('span')
  note.style.color = 'var(--mx-color-fg-muted)'
  note.textContent = 'チェックを外すと素の Edit モード相当になる。切り替えて比べる。'

  bar.append(label, note)

  const host = document.createElement('div')
  host.style.cssText = 'min-height:0;overflow:hidden'

  container.append(bar, host)

  let view = createEditor(host, toggle.checked)

  toggle.addEventListener('change', () => {
    // ドキュメントを引き継いで作り直す。
    // M2 以降は同一インスタンスの Compartment 差し替えにする（02.architecture.md §7.1）が、
    // スパイクの目的は「装飾の有無で挙動がどう変わるか」の比較なので、ここは作り直しでよい。
    const doc = view.state.doc.toString()
    const selection = view.state.selection
    view.destroy()
    view = createEditor(host, toggle.checked)
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: doc }, selection })
    view.focus()
  })

  view.focus()

  return () => {
    view.destroy()
    container.replaceChildren()
  }
}
