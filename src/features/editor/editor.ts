/**
 * CodeMirror 6 の生成と保持（F-EDIT-01 / `editor` チャンク）。
 *
 * # 1 インスタンスしか作らない
 *
 * 02.architecture/07-editor-wysiwyg.md §1 の単一エンジン方針。Edit / Split / WYSIWYG は
 * **同一の `EditorView`** で、違うのは有効な拡張と、どこに置くかだけ。
 * これにより Undo 履歴・カーソル・IME の挙動がモード間で揃う
 * （03.ux-spec/02-view-modes.md §4）。
 *
 * # Preview へ戻っても壊さない
 *
 * モードを Preview に切り替えても `destroy()` しない。**Undo 履歴が消えるため。**
 * §4 は「モードを切り替えても Undo 履歴を保持する」を要求している。
 * 隠すのは CSS の担当（`styles/shell.css` の `data-mx-mode`）。
 *
 * 破棄するのはタブを閉じるときだけで、それは M3（N-PERF-06）。
 *
 * # 本文の受け皿はコンポーネントツリーの外
 *
 * `#mx-editor` は `index.html` にあり、Svelte の管理下に無い。
 * `#mx-preview` と同じ理由で、**ここを Svelte に移さないこと**（ADR-0005）。
 */
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { bracketMatching } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import {
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
} from '@codemirror/view';

import { attachEditor, getDocumentText } from '@/features/document/text';

import { editorTheme } from './theme';

let view: EditorView | null = null;

/**
 * エディタを載せる。**2 回目以降は何もしない。**
 *
 * 初期内容は `getDocumentText()` から取る。`attachEditor` より**前**に読むこと
 * （後にすると、控えを捨てたあとの空文字を読む）。
 */
export function mountEditor(host: HTMLElement): EditorView {
  if (view) return view;

  const doc = getDocumentText();

  view = new EditorView({
    parent: host,
    state: EditorState.create({
      doc,
      extensions: [
        lineNumbers(),
        history(),
        drawSelection(),
        dropCursor(),
        rectangularSelection(),
        highlightActiveLine(),
        highlightSpecialChars(),
        bracketMatching(),
        EditorState.allowMultipleSelections.of(true),
        markdown({ base: markdownLanguage }),
        // VS Code 互換キーマップ（F-EDIT-04〜07）は Phase 3。ここに置いてあるのは
        // 「文字が打てて Undo できる」までの最小限で、`defaultKeymap` が
        // それを賄う。先に `vscodeKeymap` を入れると、アプリ側のキーとの
        // 衝突整理（`Ctrl+F` / `Ctrl+K`）が同じ回に混ざる。
        keymap.of([...historyKeymap, ...defaultKeymap]),
        EditorView.lineWrapping,
        editorTheme,
      ],
    }),
  });

  // ここから先、本文の真実は `EditorState` にある（ADR-0005）。
  attachEditor({
    read: () => view?.state.doc.toString() ?? doc,
    replace: (text) => {
      if (!view) return;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
    },
  });

  return view;
}

/** 載っているか。モード切り替えの判断に使う。 */
export function isEditorMounted(): boolean {
  return view !== null;
}

/** フォーカスを移す。Edit へ切り替えたら、そのまま打てるようにする。 */
export function focusEditor(): void {
  view?.focus();
}
