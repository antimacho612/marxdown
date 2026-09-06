/**
 * 設定を Monaco のオプションに写す（`editor` チャンク / F-CONF-04 / ADR-0012）。
 *
 * 値の検証は Rust 側（`settings/schema.rs`）と `platform/settings-schema.ts` の許容範囲が済ませており、ここで再検証しない。
 * `editor.create()` に直接書いたオプション（`editor.ts`）は設定にしないと決めたもの（N-CMP-03 に触れる／IDE 寄りの機能／禁則との衝突）で、迷ったらそちら側に置く。
 * トークンから引くのは表示倍率と `editor.fontFamily` の空欄時フォールバックの 2 つだけである（`theme.ts` 経由）。
 *
 * 設定変化の購読（`watchEditorSettings`）はルーンを使うため `watch-settings.svelte.ts` に分けてあり、このファイルは素の `.ts` のまま Svelte も Monaco も通さずテストできる。
 */
import { formatFontFamily, settingsStore } from '@/features/settings';
import type { Settings } from '@/platform';

import type { monaco } from './monaco';
import { readNumber, readValue } from './theme';

type EditorOptions = monaco.editor.IEditorOptions & monaco.editor.IGlobalEditorOptions;

/**
 * 設定 1 枚から、当てるオプション 1 枚を作る。
 *
 * **副作用を持たない。** テストが `settingsStore` を組み立てずに写像だけを見られる。
 */
export function editorOptions(values: Settings): EditorOptions {
  const wordWrap = values['editor.wordWrap'];

  return {
    // ---- フォント -------------------------------------------------
    fontFamily: fontFamily(values),
    // **倍率はここで掛ける**（F-VIEW-11）。CodeMirror では CSS の `calc()` に
    // 書けたが、Monaco の `fontSize` は数値なので JS 側で解決するしかない。
    fontSize: values['editor.fontSize'] * readNumber('--mx-zoom', 1),
    // 0 より大きく 8 未満なら**倍率**として扱われる（Monaco の `EditorLineHeight`）。
    lineHeight: values['editor.lineHeight'],
    letterSpacing: values['editor.letterSpacing'],
    fontLigatures: values['editor.fontLigatures'],

    // ---- 表示 -----------------------------------------------------
    lineNumbers: values['editor.lineNumbers'],
    renderWhitespace: values['editor.renderWhitespace'],
    renderControlCharacters: values['editor.renderControlCharacters'],
    renderLineHighlight: values['editor.renderLineHighlight'],
    guides: { indentation: values['editor.guides.indentation'] },
    bracketPairColorization: { enabled: values['editor.bracketPairColorization.enabled'] },
    minimap: { enabled: values['editor.minimap.enabled'] },
    rulers: values['editor.rulers'],
    padding: { top: values['editor.padding.top'] },

    // ---- 入力と移動 -----------------------------------------------
    wordWrap,
    wordWrapColumn: values['editor.wordWrapColumn'],
    tabSize: values['editor.tabSize'],
    insertSpaces: values['editor.insertSpaces'],
    cursorStyle: values['editor.cursorStyle'],
    cursorBlinking: values['editor.cursorBlinking'],
    cursorSurroundingLines: values['editor.cursorSurroundingLines'],
    scrollBeyondLastLine: values['editor.scrollBeyondLastLine'],

    // **横スクロールバーは折り返しの従属物。** 折り返さない設定にしたのに
    // 隠したままだと、右にはみ出した行へ到達する手段が無くなる。
    // 設定項目を 1 つ増やすより、片方から決まるほうが説明が要らない。
    scrollbar: { horizontal: wordWrap === 'off' ? 'auto' : 'hidden' },
  };
}

/**
 * フォント名。**空欄はトークン層のコードフォントに落ちる。**
 *
 * `--mx-font-code` は `preview.codeFontFamily` を先頭に足した後の値なので、
 * エディター側を指定していない人には M2 までと同じフォントが出る。
 *
 * 指定があるときに既定スタックを後ろへ足すのは `applyAppearance` と同じ理由で、
 * **そのフォントに無い字（日本語 / 記号）の落とし先を残す**ため（F-CONF-04）。
 */
function fontFamily(values: Settings): string {
  const family = formatFontFamily(values['editor.fontFamily']);
  if (family === null) return readValue('--mx-font-code');
  return `${family}, ${readValue('--mx-font-code-stack')}`;
}

/** いまの設定を当てる。 */
export function applyEditorOptions(editor: monaco.editor.IStandaloneCodeEditor): void {
  editor.updateOptions(editorOptions(settingsStore.values));
}
