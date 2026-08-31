/**
 * エディタのキーマップ（F-EDIT-04〜10, 12 / `editor` チャンク）。
 *
 * # 2 つの表の境界
 *
 * このアプリのキーは 2 か所にしかない。
 *
 * ```text
 * app/commands.ts KEY_BINDINGS   アプリに対する操作。どこにフォーカスがあっても効く
 * features/editor/keymap.ts      本文をどう編集するか。エディタに居るときだけ効く
 * ```
 *
 * **この 2 つは重ならない。** 重なると、エディタ（要素で捕まえる）が先に処理し、
 * そのあと `globalThis` のリスナがもう一度同じキーを処理することになる。
 * 重ならないようにする作業が、下の `REMOVED` である。
 *
 * # 作業が反転した
 *
 * CodeMirror では **VS Code 互換キーマップを外から足す**必要があり、
 * `@replit/codemirror-vscode-keymap` を丸ごと入れて要らないものを名指しで外していた。
 *
 * **Monaco では VS Code のキーが最初から全部入っている。** やることは
 * 「Marxdown がアプリ側で握るキーを剥がす」ことだけになった
 * （[ADR-0009](../../../docs/adr/0009-editor-engine-monaco.md) の受け入れコスト 6）。
 *
 * ついでに消えた作業もある。**マルチカーソルと矩形選択の修飾子は直さなくてよい。**
 * CodeMirror は `Ctrl+クリック` / `Alt+ドラッグ` を既定にしていて VS Code と食い違っていたが、
 * Monaco は `Alt+クリック` / `Shift+Alt+ドラッグ` で
 * [03.ux-spec > keybindings §3](../../../docs/03.ux-spec/04-keybindings.md) と最初から一致する。
 *
 * # 綴りではなく定数で書ける
 *
 * CodeMirror 版の `DROPPED` は**キーの綴りを文字列で照合**していたため、
 * パッケージ側の綴りが変わると黙って外れなくなり、それをテストで見張っていた。
 * Monaco は `KeyMod` / `KeyCode` の定数なので、**名前が変われば型で落ちる。**
 * 見張るテストが要らなくなったぶん、`keymap.test.ts` は畳んである。
 *
 * # IME 変換中には割り込まない
 *
 * `Enter` と `Backspace` を横取りしているが、**変換中の確定は奪わない。**
 * IME の変換中、ブラウザは `keyCode: 229` で keydown を出す。Monaco の
 * `StandardKeyboardEvent` はこれをどのキーにも対応させないので、
 * キーバインドはそもそも解決されない。
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
 * キーを載せる。**`mountEditor` から 1 回だけ呼ぶ。**
 *
 * `addKeybindingRules` はグローバル（エディタごとではない）だが、
 * エディタは 1 つしか作らないので問題にならない（`editor.ts`）。
 */
export function installEditorKeymap(editor: monaco.editor.IStandaloneCodeEditor): void {
  monaco.editor.addKeybindingRules(REMOVED.map(({ keybinding }) => ({ keybinding, command: null })));

  for (const { keybinding, edit } of MARKDOWN) {
    editor.addCommand(keybinding, commandFor(editor, edit, 'markdown.format'));
  }

  for (const { keybinding, edit, handler, payload } of FALLTHROUGH) {
    editor.addCommand(keybinding, () => {
      if (runEdit(editor, edit, 'markdown.list')) return;
      editor.trigger(KEYBOARD_SOURCE, handler, payload ?? null);
    });
  }
}
