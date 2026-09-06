/**
 * Monaco から何を取るかの一覧（`editor` チャンク / ADR-0009）。
 *
 * Monaco は予算の対象外だが無審査に増やしてよい訳ではない（`import 'monaco-editor'` は全言語 + LSP で 3,142.7KB gzip）。
 * 追加するときは Design Brief §15 のどの価値に貢献するかを言えること。
 * 補完系・言語サービス系・`links`（ナビゲーション禁止と衝突）・`format`（N-CMP-03）・`quickCommand`（コマンドパレットはアプリ側）・`minimap`（既定 OFF）は採らない。
 *
 * `nls/lang/ja.js` は評価時に `_VSCODE_NLS_MESSAGES` を立てるだけで、`localize()` を呼ぶモジュールより先に評価されないと効かない。
 * 並び順に意味があるため import 順の lint ルールはこのファイルだけ外してある。
 */
import 'monaco-editor/nls/lang/ja.js';
import 'monaco-editor/languages/definitions/markdown/register.js';
import 'monaco-editor/editor/browser/coreCommands.js';
import 'monaco-editor/features/bracketMatching/register.js';
import 'monaco-editor/features/caretOperations/register.js';
import 'monaco-editor/features/clipboard/register.js';
import 'monaco-editor/features/comment/register.js';
import 'monaco-editor/features/cursorUndo/register.js';
import 'monaco-editor/features/codicon/register.js';
import 'monaco-editor/features/contextmenu/register.js';
import 'monaco-editor/features/dnd/register.js';
import 'monaco-editor/features/find/register.js';
import 'monaco-editor/features/folding/register.js';
import 'monaco-editor/features/gotoLine/register.js';
import 'monaco-editor/features/linesOperations/register.js';
import 'monaco-editor/features/lineSelection/register.js';
import 'monaco-editor/features/longLinesHelper/register.js';
import 'monaco-editor/features/multicursor/register.js';
import 'monaco-editor/features/smartSelect/register.js';
import 'monaco-editor/features/wordHighlighter/register.js';
import 'monaco-editor/features/wordOperations/register.js';
import 'monaco-editor/features/wordPartOperations/register.js';

// 名前空間そのもの。**NLS の直後に置く**（上のコメント）。
export * as monaco from 'monaco-editor/editor/editor.api.js';

/** モデルに付ける言語 ID。Monarch の定義と揃える。 */
export const MARKDOWN_LANGUAGE_ID = 'markdown';
