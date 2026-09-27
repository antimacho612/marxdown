/**
 * エディターのキーマップ（F-EDIT-04〜10, 12 / `editor` チャンク）。
 *
 * キーの割り当ては 2 か所にだけある。`app/commands.ts` の `KEY_BINDINGS`（どこでも有効なアプリ操作）と、ここ（エディターにフォーカスがあるときだけ有効な編集操作）である。
 * 重複すると Monaco が先に処理し、続けて `globalThis` のリスナも処理するため、重複するキーは `REMOVED` で Monaco から外す。
 *
 * Monaco は VS Code のキーバインドを最初から持っているため、ここで行うのはアプリ側が処理するキーを外すことと、Markdown の書式を追加することだけである（ADR-0009 の受け入れコスト 6）。
 * マルチカーソル/矩形選択の修飾子も既定でキーバインドの仕様と一致するため変更する必要はない。
 *
 * `REMOVED` は `KeyMod` / `KeyCode` の定数で照合するため、定数名が変わると型検査で検出できる。
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
import { formatTable, moveToNextCell, moveToPreviousCell } from './table';

const { KeyCode, KeyMod } = monaco;

/** `editor.trigger` に渡す名前。この文字列自体に意味がある（`FALLTHROUGH` の但し書きを参照）。 */
const KEYBOARD_SOURCE = 'keyboard';

/**
 * Monaco から解除するキー。アプリ側で処理するものを列挙する。
 *
 */
const REMOVED: { keybinding: number; why: string }[] = [
  // 検索を開く処理はアプリ側が担当する。
  // 表示中の面によって開く対象が変わる（Preview なら本文検索、Edit ならエディター検索）ため、エディターが自分で受け取ると二重に開く（`features/mode/find.ts`）。
  { keybinding: KeyMod.CtrlCmd | KeyCode.KeyF, why: 'アプリの Ctrl+F が面ごとに振り分ける' },
  { keybinding: KeyMod.CtrlCmd | KeyCode.KeyH, why: 'Ctrl+H も同じ経路を通す' },

  // 指定行へ移動はアプリ側が担当する（`Ctrl+G`）。
  // Monaco も同じキーに `editor.action.gotoLine` を持っており、外さないと `globalThis` のリスナと二重に処理される。
  // アクションそのものはアプリ側から実行する（`editor.ts` の `gotoLine`）。
  { keybinding: KeyMod.CtrlCmd | KeyCode.KeyG, why: 'アプリの Ctrl+G が指定行へ移動を開く' },

  // Markdown の書式に使う。割り当ては下の `MARKDOWN` が持つ。
  { keybinding: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyL, why: 'Ctrl+Shift+L は箇条書きの切替' },
  { keybinding: KeyMod.CtrlCmd | KeyCode.Enter, why: 'Ctrl+Enter はタスクリストのチェック切替' },
];

/**
 * Markdown の書式（F-EDIT-08）。
 *
 * `Ctrl+B` が太字なのは Markdown First を Familiar より優先した決定による。
 * VS Code のサイドバー切替は `Ctrl+Shift+B` へ移してある。
 *
 * `Ctrl+K` は Monaco では和音の先頭でもある（`Ctrl+K Ctrl+C` は行コメントなど）。
 * `addCommand` で追加したキーはユーザーの割り当てとして既定より優先されるため、和音には入らずリンク挿入が実行される。
 * 和音を採用しないと決めているため、この挙動でよい。
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

  // 見出しは `Ctrl+1`〜`9` をタブ切り替えに使うため `Ctrl+Alt+n` に割り当てる。
  // 1〜6 はレベルの設定であり、トグルではない（`format.ts`）。
  ...[1, 2, 3, 4, 5, 6].map((level) => ({
    keybinding: KeyMod.CtrlCmd | KeyMod.Alt | (KeyCode.Digit0 + level),
    edit: setHeading(level),
  })),
  { keybinding: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Digit0, edit: setHeading(0) },

  // 表の列幅を揃える（F-EDIT-11）。VS Code の「ドキュメントのフォーマット」と同じキーである。
  // Markdown にフォーマッタは無く、このアプリが整形するのは表だけなので、押した結果は 1 つに定まる。
  { keybinding: KeyMod.Shift | KeyMod.Alt | KeyCode.KeyF, edit: formatTable },
];

/**
 * コマンドが処理しなかった場合に既定の動作へ渡すもの。
 *
 * `Tab` はリストの行でなければ通常のインデント、`Enter` はリストの中でなければ通常の改行になる必要がある。
 * Monaco のキーバインドには次の候補へ処理を渡す仕組みが無いため、既定の動作を `editor.trigger` で明示的に呼ぶ。
 *
 * `handler` は `browser/coreCommands.js` が登録している id である。
 *
 * `source` は `'keyboard'` でなければならない。
 * `CursorsController.type()` はこの文字列を参照しており、`'keyboard'` のときだけ `typeWithInterceptors` を通る（`common/cursor/cursor.js`）。
 * 別の名前を渡すと `Enter` が `autoIndent: 'keep'` を通らず、前の行のインデントを引き継がない（インデントした段落の末尾で改行すると桁 1 に戻る）。
 */
const FALLTHROUGH: {
  keybinding: number;
  /**
   * 編集を伴わない処理（表のセル移動 / F-EDIT-11）。`edit` より先に試す。
   *
   * 選択範囲を動かすだけなので `MarkdownEdit` では表せない。
   * `runEdit` は編集が 0 件なら「処理しなかった」と見なすため、そちらに置くと常に既定動作へ渡る。
   */
  move?: (editor: monaco.editor.ICodeEditor) => boolean;
  edit: MarkdownEdit;
  handler: string;
  payload?: unknown;
}[] = [
  { keybinding: KeyCode.Tab, move: moveToNextCell, edit: indentList, handler: 'tab' },
  { keybinding: KeyMod.Shift | KeyCode.Tab, move: moveToPreviousCell, edit: outdentList, handler: 'outdent' },
  // F-EDIT-09 / F-EDIT-10。既定は「前の行のインデントを引き継ぐ改行」（`autoIndent: 'keep'`）。
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
 * `editor.addCommand` の第 3 引数（precondition）。指定しないと検索ボックスの入力まで横取りする。
 *
 * `addCommand` は既定で無条件（どこにフォーカスがあっても発火）になる。
 * Find ウィジェットの入力欄は `#mx-editor` の中にある別の `<textarea>` であり、本文の入力面ではない。
 * 条件を付けないと、ウィジェットの中で `Backspace` を押しても文字は削除されず、本文が削除される。
 *
 * Monaco 自身の `deleteLeft` などはこの区別を `textInputFocus`（`_editor.hasTextFocus()`）で行っている。
 * `editorTextFocus` はほぼ同じ判定である。
 */
const EDITOR_TEXT_FOCUS = 'editorTextFocus';

/**
 * キーを登録する。`mountEditor` から 1 回だけ呼ぶ。
 *
 * `addKeybindingRules` はグローバル（エディターごとではない）だが、エディターは 1 つしか作らないので問題にならない（`editor.ts`）。
 */
export function installEditorKeymap(editor: monaco.editor.IStandaloneCodeEditor): void {
  monaco.editor.addKeybindingRules(REMOVED.map(({ keybinding }) => ({ keybinding, command: null })));

  for (const { keybinding, edit } of MARKDOWN) {
    editor.addCommand(keybinding, commandFor(editor, edit, 'markdown.format'), EDITOR_TEXT_FOCUS);
  }

  for (const { keybinding, move, edit, handler, payload } of FALLTHROUGH) {
    editor.addCommand(
      keybinding,
      () => {
        if (move?.(editor) === true) return;
        if (runEdit(editor, edit, 'markdown.list')) return;
        editor.trigger(KEYBOARD_SOURCE, handler, payload ?? null);
      },
      EDITOR_TEXT_FOCUS,
    );
  }
}
