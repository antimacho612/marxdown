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
import { history } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { bracketMatching } from '@codemirror/language';
import { highlightSelectionMatches, openSearchPanel, search } from '@codemirror/search';
import { EditorState } from '@codemirror/state';
import {
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightSpecialChars,
  lineNumbers,
  rectangularSelection,
} from '@codemirror/view';

import { markDirty } from '@/features/document/dirty';
import { scheduleLiveRender } from '@/features/document/live';
import { attachEditor, getDocumentText } from '@/features/document/text';
import { startScrollSync, stopScrollSync } from '@/features/view/scroll-sync';
import { ja } from '@/i18n/ja';

import { editorKeymap } from './keymap';
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
        highlightActiveLine(),
        highlightSpecialChars(),
        bracketMatching(),
        EditorState.allowMultipleSelections.of(true),
        // **既定のまま使う。** `markdown()` は素のパーサだけでなく、
        // Markdown を書くための拡張を既に抱えている（M2 Phase 4 で気づいた）。
        //
        //   addKeymap      Enter でリストを続ける / Backspace で記法を畳む
        //                  （`insertNewlineContinueMarkup` / `deleteMarkupBackward`）
        //   pasteURLAsLink 選択したうえで URL を貼ると `[選んだ文字](URL)` になる
        //
        // 前者は **`Prec.high` で入る**ので、同じ `Enter` を後から足しても効かない。
        // どちらも構文木を見て動くぶん、行を正規表現で見る自前の実装より確かで、
        // F-EDIT-09, 10, 12 はこれで満たされている（06.roadmap/m2-editor.md §5 の Phase 4）。
        markdown({ base: markdownLanguage }),

        // マルチカーソルと矩形選択（F-EDIT-06 / 03.ux-spec/04-keybindings.md §3）。
        //
        // **既定のままでは VS Code と食い違う。** CodeMirror は
        //   - カーソルの追加を `Ctrl+クリック`（`clickAddsSelectionRange` の既定）
        //   - 矩形選択を `Alt+ドラッグ`（`rectangularSelection` の既定）
        // に割り当てるが、VS Code はそれぞれ `Alt+クリック` と `Shift+Alt+ドラッグ`。
        // §3 が `Alt+Click` = カーソル追加と定めている以上、**Alt をカーソル追加へ渡し、
        // 矩形選択を Shift+Alt へずらす**。片方だけ直すと 2 つが同じ修飾子を奪い合う。
        rectangularSelection({ eventFilter: (event) => event.altKey && event.shiftKey }),
        EditorView.clickAddsSelectionRange.of((event) => event.altKey && !event.shiftKey),

        // 検索・置換（F-EDIT-05）。パネルは上に出す（VS Code と同じ側）。
        // 正規表現・大文字小文字・単語単位はパネルのチェックボックスが持っている。
        search({ top: true }),
        // 選択した語と同じものを薄く光らせる。VS Code の既定の挙動で、
        // `Ctrl+D` で次を選ぶときに「次がどこか」が先に見える。
        highlightSelectionMatches(),
        // CodeMirror 自身が出す文言（パネルのラベルと読み上げ）を日本語にする。
        // **UI 文言は `i18n/ja.ts` に集約する**という決定（OQ-11）の範囲。
        EditorState.phrases.of(ja.editor.phrases),

        // VS Code 互換キーマップ（F-EDIT-04〜07）と Markdown の書式（F-EDIT-08〜10）。
        // 外したキーとその理由は `keymap.ts`。
        editorKeymap,
        EditorView.lineWrapping,
        // ダーティ状態（F-EDIT-03）。**boolean 1 つだけがリアクティビティを通る。**
        // 本文そのものはここを通らない（ADR-0005 / 02.architecture/08-state-management.md §1）。
        //
        // `markDirty` は既にダーティなら何もしないので、打鍵ごとに
        // ストアの書き込みや IPC が走ることはない（`document/save.ts`）。
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) return;
          markDirty();
          // Split では右のプレビューを追いかけさせる（F-MODE-03）。
          // 打鍵ごとには描き直さない（`document/live.ts` が待つ）。
          scheduleLiveRender();
        }),
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

/**
 * 検索パネルを開く（F-EDIT-05）。`replace` が true なら置換欄へフォーカスする。
 *
 * **載っていなければ何もしない。** Preview を見ているときの `Ctrl+F` は
 * 本文検索へ行くので、ここまで来ない（`features/view/find.ts`）。
 *
 * 置換欄を探せるのは、`openSearchPanel` がパネルの DOM を
 * `dispatch` の中で同期的に組み立てるため。読み取り専用のときは
 * 置換欄そのものが作られないので、その場合は検索欄のままになる。
 */
export function openEditorSearch(replace: boolean): void {
  if (!view) return;

  openSearchPanel(view);
  if (!replace) return;

  const field = view.dom.querySelector<HTMLInputElement>('.cm-search input[name="replace"]');
  field?.focus();
  field?.select();
}

/**
 * Split のスクロール同期を始める / やめる（F-MODE-05）。
 *
 * **`EditorView` を外へ渡さないための包み。** 同期の中身は `features/view/scroll-sync.ts`
 * （`main` チャンク）にあり、`EditorView` を型としてしか知らない。
 * 実体を渡せるのはここだけなので、ここが橋渡しをする。
 */
export function setSplitSync(on: boolean): void {
  if (!on) {
    stopScrollSync();
    return;
  }
  if (view) startScrollSync(view);
}
