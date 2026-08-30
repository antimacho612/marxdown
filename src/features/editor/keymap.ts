/**
 * エディタのキーマップ（F-EDIT-04〜07 / `editor` チャンク）。
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
 * **この 2 つは重ならない。** 重なると、CodeMirror（要素で捕まえる）が先に処理し、
 * そのあと `globalThis` のリスナがもう一度同じキーを処理することになる。
 * `lib/shortcuts.ts` から `whenEditing` を落とせたのは、この境界を引いたため。
 *
 * 重ならないようにする作業が、下の `DROPPED` である。
 *
 * # `@replit/codemirror-vscode-keymap` をそのまま使わない
 *
 * VS Code 互換であること自体は F-EDIT-04〜07 が要求しているが、
 * このパッケージには **Marxdown が採らないと決めたキー**が混ざっている
 * （和音 / lint パネル / Phase 4・5 で Markdown の書式に使うキー）。
 * 採用の形は「丸ごと入れて、外すものを名指しする」。**外した理由が読める**ことと、
 * パッケージが増やしたキーが黙って入ってこないことの両方が要る。
 */
import { copyLineDown, copyLineUp, defaultKeymap, historyKeymap } from '@codemirror/commands';
import { closeSearchPanel, findNext, findPrevious } from '@codemirror/search';
import type { Extension } from '@codemirror/state';
import { keymap, type KeyBinding } from '@codemirror/view';
import { vscodeKeymap } from '@replit/codemirror-vscode-keymap';

/**
 * `vscodeKeymap` から外すキー。**綴りはパッケージの `key` そのまま**。
 *
 * ここに書いたものがパッケージ側に実在することは `keymap.test.ts` が見張る。
 * 綴りが変わったら、黙って外れなくなるのではなくテストが落ちる。
 */
const DROPPED: Record<string, string> = {
  // 和音は採らない（03.ux-spec/04-keybindings.md §2）。第 1 打鍵のあとに待機状態が生まれ、
  // 「いま何が起きているか」を意識させる。加えて **`Ctrl+K` はリンク挿入に使う**（Phase 4）。
  'Mod-k Mod-0': '和音（折りたたみ）',
  'Mod-k Mod-j': '和音（展開）',
  'Mod-k Mod-c': '和音（行コメント）',
  'Mod-k Mod-u': '和音（コメント解除）',

  // 検索を開くのはアプリの仕事。**見ている面によって開くものが変わる**ので
  // （Preview なら本文検索 / Edit ならエディタ検索）、エディタが自分で受けると
  // 二重に開く（`features/view/find.ts`）。
  'Mod-f': 'アプリの Ctrl+F が面ごとに振り分ける',

  // Phase 4 で Markdown の書式に使う（03.ux-spec/04-keybindings.md §3）。
  // **いま外しておく。** 後から外すと、一度できた操作を取り上げることになる。
  'Shift-Mod-l': 'Ctrl+Shift+L は箇条書きの切替（Phase 4）',

  // lint 拡張を入れていないので、開いても空のパネルが出るだけ。
  // `Ctrl+Shift+M` は Phase 5 でモードの順送りに使う。
  'Mod-Shift-m': 'lint パネルの実体が無い / Ctrl+Shift+M はモード順送り（Phase 5）',
  F8: 'lint の診断が無い',
};

/**
 * パッケージに無く、こちらで足すもの。
 *
 * **`Shift+Alt+↑ / ↓` は Windows で効かない。** パッケージがこの 2 つを
 * `mac:` にしか割り当てておらず、`key` を持っていない。F-EDIT-07（行複製）が
 * 要求しているので、ここで補う。
 *
 * `F3` と `Escape` に `scope` を付けているのは、**検索パネルの入力欄に
 * フォーカスがあるときも効かせる**ため。`vscodeKeymap` の `Escape` は
 * scope を持たず、編集面に居るときしか効かない。
 */
const ADDED: KeyBinding[] = [
  { key: 'Shift-Alt-ArrowUp', run: copyLineUp, preventDefault: true },
  { key: 'Shift-Alt-ArrowDown', run: copyLineDown, preventDefault: true },
  { key: 'F3', run: findNext, shift: findPrevious, scope: 'editor search-panel', preventDefault: true },
  { key: 'Escape', run: closeSearchPanel, scope: 'editor search-panel' },
];

/** 外した後の VS Code 互換キーマップ。テストから見えるように export する。 */
export function withoutDropped(bindings: readonly KeyBinding[]): KeyBinding[] {
  return bindings.filter((binding) => binding.key === undefined || !Object.hasOwn(DROPPED, binding.key));
}

/** `DROPPED` の綴りが実在するかを検査するために要る。 */
export const DROPPED_KEYS: readonly string[] = Object.keys(DROPPED);

/**
 * 並び順は**先に書いたものが先に試される**。
 *
 * `defaultKeymap` を最後に残しているのは、`vscodeKeymap` が触れていない
 * 基本操作（改行のインデントなど）の受け皿として要るため。
 */
export const editorKeymap: Extension = keymap.of([
  ...ADDED,
  ...withoutDropped(vscodeKeymap),
  ...historyKeymap,
  ...defaultKeymap,
]);
