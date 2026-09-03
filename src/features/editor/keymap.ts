/**
 * エディタのキーマップ（F-EDIT-04〜10, 12 / `editor` チャンク）。
 *
 * キーは 2 表にしか無い。`app/commands.ts` の `KEY_BINDINGS`（どこでも効くアプリ操作）と、ここ（エディタに居るときだけ効く編集操作）である。
 * 重なると要素側が先に処理し `globalThis` のリスナが二重に処理するため、重複キーは `REMOVED` で剥がす。
 *
 * Monaco は VS Code のキーが最初から入っているため、CodeMirror 時代の「互換キーマップを外から足す」作業が「アプリ側が握るキーを剥がす」だけになった（ADR-0009 の受け入れコスト 6）。
 * マルチカーソル/矩形選択の修飾子も既定で 03.ux-spec/04-keybindings.md §3 と一致するため直す必要がない。
 *
 * `DROPPED` は `KeyMod` / `KeyCode` の定数で照合するため、パッケージの綴りが変わると型で落ちる（CodeMirror 版の文字列照合とは違い見張るテストが不要）。
 *
 * `Enter` / `Backspace` を横取りするが、IME 変換中（`keyCode: 229`）は Monaco がキーバインドを解決しないため確定操作を奪わない。
 */
import { runEdit, type MarkdownEdit } from './edits';
import { continueList, deleteMarkupBackward } from './enter';
import {
  insertLink,
  setHeading,
  toggleBlockquote,
  toggleBold,
  toggleBulletList,
  toggleCodeBlock,
  toggleInlineCode,
  toggleItalic,
  toggleOrderedList,
  toggleStrikethrough,
  toggleTaskCheck,
} from './format';
import { indentList, outdentList } from './list';
import { monaco } from './monaco';

const { KeyCode, KeyMod } = monaco;

/** `editor.trigger` に渡す名前。**この文字列に意味がある**（`FALLTHROUGH` の但し書き）。 */
const KEYBOARD_SOURCE = 'keyboard';

/**
 * Monaco から剥がすキー。**アプリ側が握るもの。**
 *
 * → [03.ux-spec > keybindings §4](../../../docs/03.ux-spec/04-keybindings.md)
 */
const REMOVED: { keybinding: number; why: string }[] = [
  // 検索を開くのはアプリの仕事。**見ている面によって開くものが変わる**ので
  // （Preview なら本文検索 / Edit ならエディタ検索）、エディタが自分で受けると
  // 二重に開く（`features/view/find.ts`）。
  { keybinding: KeyMod.CtrlCmd | KeyCode.KeyF, why: 'アプリの Ctrl+F が面ごとに振り分ける' },
  { keybinding: KeyMod.CtrlCmd | KeyCode.KeyH, why: 'Ctrl+H も同じ経路を通す' },

  // Markdown の書式に使う（§3）。下の `MARKDOWN` が持つ。
  { keybinding: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyL, why: 'Ctrl+Shift+L は箇条書きの切替' },
  { keybinding: KeyMod.CtrlCmd | KeyCode.Enter, why: 'Ctrl+Enter はタスクリストのチェック切替' },
];

/**
 * Markdown の書式（F-EDIT-08 / §3「Markdown 書式」）。
 *
 * `Ctrl+B` が太字なのは §1 の決定（Markdown First > Familiar）。
 * VS Code のサイドバー切替は `Ctrl+Shift+B` へ移してある。
 *
 * > **`Ctrl+K` は Monaco では和音の頭でもある**（`Ctrl+K Ctrl+C` = 行コメントなど）。
 * > `addCommand` で足したキーは「ユーザーの割り当て」として既定より優先されるので、
 * > 和音へ入らずリンク挿入が動く。§2 で和音を採らないと決めているので、これでよい。
 */
const MARKDOWN: { keybinding: number; edit: MarkdownEdit }[] = [
  { keybinding: KeyMod.CtrlCmd | KeyCode.KeyB, edit: toggleBold },
  { keybinding: KeyMod.CtrlCmd | KeyCode.KeyI, edit: toggleItalic },
  { keybinding: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyX, edit: toggleStrikethrough },
  { keybinding: KeyMod.CtrlCmd | KeyCode.Backquote, edit: toggleInlineCode },
  { keybinding: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Backquote, edit: toggleCodeBlock },
  { keybinding: KeyMod.CtrlCmd | KeyCode.KeyK, edit: insertLink },

  { keybinding: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Period, edit: toggleBlockquote },
  { keybinding: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyL, edit: toggleBulletList },
  { keybinding: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyN, edit: toggleOrderedList },
  { keybinding: KeyMod.CtrlCmd | KeyCode.Enter, edit: toggleTaskCheck },

  // 見出しは `Ctrl+1`〜`9` がタブ切り替えに要るので `Ctrl+Alt+n`（§3 の但し書き）。
  // **1〜6 は設定であってトグルではない**（`format.ts`）。
  ...[1, 2, 3, 4, 5, 6].map((level) => ({
    keybinding: KeyMod.CtrlCmd | KeyMod.Alt | (KeyCode.Digit0 + level),
    edit: setHeading(level),
  })),
  { keybinding: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Digit0, edit: setHeading(0) },
];

/**
 * 手を引いたら**既定の動作へ渡す**もの。
 *
 * `Tab` はリストの行でなければただのインデント、`Enter` はリストの中でなければ
 * ただの改行でなければならない。CodeMirror では `false` を返せば次のバインドへ
 * 落ちたが、**Monaco のキーバインドには「次」が無い。** 既定の動作を
 * `editor.trigger` で自分で呼ぶことで同じ形にする。
 *
 * `handler` は `browser/coreCommands.js` が登録している id。
 *
 * > **`source` は `'keyboard'` でなければならない。**
 * > `CursorsController.type()` はこの文字列を見ており、`'keyboard'` のときだけ
 * > `typeWithInterceptors` を通る（`common/cursor/cursor.js`）。別の名前を渡すと
 * > **`Enter` が `autoIndent: 'keep'` を通らず、前の行のインデントを継がない。**
 * > 実測で気づいた（`dev:web` で `  段落` の末尾から改行して桁 1 に落ちた）。
 */
const FALLTHROUGH: { keybinding: number; edit: MarkdownEdit; handler: string; payload?: unknown }[] = [
  { keybinding: KeyCode.Tab, edit: indentList, handler: 'tab' },
  { keybinding: KeyMod.Shift | KeyCode.Tab, edit: outdentList, handler: 'outdent' },
  // F-EDIT-09 / F-EDIT-10。既定は「前の行のインデントを継ぐ改行」（`autoIndent: 'keep'`）。
  { keybinding: KeyCode.Enter, edit: continueList, handler: 'type', payload: { text: '\n' } },
  { keybinding: KeyCode.Backspace, edit: deleteMarkupBackward, handler: 'deleteLeft' },
];

/** `editor.addCommand` に渡す実行体。`source` は Undo の履歴に残る名前。 */
function commandFor(editor: monaco.editor.IStandaloneCodeEditor, edit: MarkdownEdit, source: string): () => void {
  return () => {
    runEdit(editor, edit, source);
  };
}

/**
 * `editor.addCommand` の第 3 引数（precondition）。**これが無いと検索ボックスまで奪う**（#54）。
 *
 * `addCommand` はデフォルトで無条件（どこにフォーカスがあっても発火）になる。
 * Find ウィジェットの入力欄は `#mx-editor` の中にある別の `<textarea>` であって、
 * 本文の入力面ではない（`open-search.ts` の但し書きと同じ理由）。ここを縛らないと、
 * ウィジェットの中で `Backspace` を押しても文字は消えず、代わりに本文が削れる。
 *
 * Monaco 自身の `deleteLeft` 等はこの区別を `textInputFocus`（`_editor.hasTextFocus()`）で
 * 行っている。`editorTextFocus` はほぼ同じ判定で、こちらの一覧に揃えてある。
 */
const EDITOR_TEXT_FOCUS = 'editorTextFocus';

/**
 * キーを載せる。**`mountEditor` から 1 回だけ呼ぶ。**
 *
 * `addKeybindingRules` はグローバル（エディタごとではない）だが、
 * エディタは 1 つしか作らないので問題にならない（`editor.ts`）。
 */
export function installEditorKeymap(editor: monaco.editor.IStandaloneCodeEditor): void {
  monaco.editor.addKeybindingRules(REMOVED.map(({ keybinding }) => ({ keybinding, command: null })));

  for (const { keybinding, edit } of MARKDOWN) {
    editor.addCommand(keybinding, commandFor(editor, edit, 'markdown.format'), EDITOR_TEXT_FOCUS);
  }

  for (const { keybinding, edit, handler, payload } of FALLTHROUGH) {
    editor.addCommand(
      keybinding,
      () => {
        if (runEdit(editor, edit, 'markdown.list')) return;
        editor.trigger(KEYBOARD_SOURCE, handler, payload ?? null);
      },
      EDITOR_TEXT_FOCUS,
    );
  }
}
