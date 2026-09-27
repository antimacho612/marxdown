/**
 * Monaco の UI 文言の言語（ADR-0026）。`monaco.ts` の最初に import する。
 *
 * NOTE: `nls/lang/ja.js` は評価時に `_VSCODE_NLS_MESSAGES` を設定するだけであり、`localize()` を呼ぶモジュールより先に評価されないと効果が無い。
 * 動的 import にすると順序を保証できないため、表示言語によらず静的に読み込み、日本語でなければ直後に取り消す。
 * 取り消した状態では Monaco は組み込みの英語を使う。
 */
import 'monaco-editor/nls/lang/ja.js';

import { getLocale } from '@/i18n';

if (getLocale() !== 'ja') {
  Reflect.deleteProperty(globalThis, '_VSCODE_NLS_MESSAGES');
  Reflect.deleteProperty(globalThis, '_VSCODE_NLS_LANGUAGE');
}
