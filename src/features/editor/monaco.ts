/**
 * Monaco から**何を取るか**の一覧（`editor` チャンク / [ADR-0009](../../../docs/adr/0009-editor-engine-monaco.md)）。
 *
 * # ここが予算の実体
 *
 * Monaco は予算の対象外に置いてあるが、それは**無審査に増やしてよいという意味ではない**
 * （05.performance-budget/05-operations.md §1）。`import 'monaco-editor'` は
 * 全言語 + LSP クライアントで 3,142.7KB (gzip) になる。**この一覧が、そうならない理由。**
 *
 * contrib を 1 つ足すときは、それが Design Brief §15 のどの価値に貢献するかを言えること。
 *
 * # 採らないものと、その理由
 *
 * | 採らない | 理由 |
 * | --- | --- |
 * | `suggest` / `inlineCompletions` / `parameterHints` / `hover` | Markdown に補完は要らない。**editor worker を起こす経路でもある** |
 * | `links` | エディタ上のリンクを踏むと `openerService` が開きにいく。ナビゲーション禁止（ADR-0006）と衝突するので、経路ごと持たない |
 * | `unicodeHighlighter` | 曖昧・不可視文字を光らせる。**日本語の本文では鳴りっぱなしになる** |
 * | `format` / `insertFinalNewLine` | 触っていない箇所のバイト列を変える（N-CMP-03） |
 * | `quickCommand`（`F1` のパレット） | コマンドパレットはアプリ側の担当（M3 / F-NAV-06） |
 * | `codeAction` / `rename` / `gotoSymbol` / `codelens` / `semanticTokens` / `inlayHints` | 言語サービスが無いので発火しない |
 * | `minimap`（オプションで OFF） | Markdown では価値が薄く、画面を狭める（ADR-0001 から引き継ぐ判断） |
 *
 * # 日本語 NLS は一番上でなければならない
 *
 * `nls/lang/ja.js` は評価時に `globalThis._VSCODE_NLS_MESSAGES` を立てるだけの
 * モジュールで、**`localize()` を評価時に呼ぶモジュールより先に入っていないと効かない。**
 * 並び順に意味があるので、整列や「代入されていない import」の規則は
 * `eslint.config.js` の側でこのファイルだけ外してある。
 */
import 'monaco-editor/nls/lang/ja.js';
// 入力・カーソル移動・選択の中核。これが無いと文字も打てない。
import 'monaco-editor/editor/browser/coreCommands.js';
// 編集の手触り（F-EDIT-04〜07 / 03.ux-spec/04-keybindings.md §3「編集」）
import 'monaco-editor/features/multicursor/register.js';
import 'monaco-editor/features/linesOperations/register.js';
import 'monaco-editor/features/lineSelection/register.js';
import 'monaco-editor/features/wordOperations/register.js';
import 'monaco-editor/features/wordPartOperations/register.js';
import 'monaco-editor/features/smartSelect/register.js';
import 'monaco-editor/features/caretOperations/register.js';
import 'monaco-editor/features/cursorUndo/register.js';
import 'monaco-editor/features/comment/register.js';
import 'monaco-editor/features/clipboard/register.js';
import 'monaco-editor/features/dnd/register.js';
// 検索・置換（F-EDIT-05）と指定行へ移動（`Ctrl+G`）
import 'monaco-editor/features/find/register.js';
import 'monaco-editor/features/gotoLine/register.js';
// 読むための補助。`wordHighlighter` は「選択した語と同じもの」を薄く光らせる。
import 'monaco-editor/features/wordHighlighter/register.js';
import 'monaco-editor/features/bracketMatching/register.js';
import 'monaco-editor/features/folding/register.js';
import 'monaco-editor/features/longLinesHelper/register.js';
import 'monaco-editor/features/contextmenu/register.js';
// Markdown の構文着色（Monarch）。**言語はこれ 1 つだけ入れる。**
import 'monaco-editor/languages/definitions/markdown/register.js';

// 名前空間そのもの。**NLS の直後に置く**（上のコメント）。
export * as monaco from 'monaco-editor/editor/editor.api.js';

/** モデルに付ける言語 ID。Monarch の定義と揃える。 */
export const MARKDOWN_LANGUAGE_ID = 'markdown';
