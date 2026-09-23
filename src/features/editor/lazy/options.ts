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
 * スクロールバーの太さ（px）。
 *
 * アプリ側の面は `scrollbar-width: thin` の素のスクロールバーで、Chromium ではこれが 10px になる（`styles/reset.css`）。
 * Monaco は自前の DOM で描くため既定の 14px のままだと編集面だけが太い。
 * トークンにしないのは、値の出どころがブラウザの `thin` であってアプリの意匠ではないためである。
 */
const SCROLLBAR_SIZE = 10;

/**
 * 設定から、適用する Monaco のオプションを作る。
 *
 * 副作用を持たない。テストは `settingsStore` を用意せずに写像だけを検証できる。
 */
export function editorOptions(values: Settings): EditorOptions {
  const wordWrap = values['editor.wordWrap'];

  return {
    fontFamily: fontFamily(values),
    // 表示倍率はここで掛ける（F-VIEW-11）。Monaco の `fontSize` は数値であるため、CSS ではなく JS 側で解決する。
    fontSize: values['editor.fontSize'] * readNumber('--mx-zoom', 1),
    // 0 より大きく 8 未満なら倍率として扱われる（Monaco の `EditorLineHeight`）。
    lineHeight: values['editor.lineHeight'],
    letterSpacing: values['editor.letterSpacing'],
    fontLigatures: values['editor.fontLigatures'],

    lineNumbers: values['editor.lineNumbers'],
    renderWhitespace: values['editor.renderWhitespace'],
    renderControlCharacters: values['editor.renderControlCharacters'],
    renderLineHighlight: values['editor.renderLineHighlight'],
    guides: { indentation: values['editor.guides.indentation'] },
    bracketPairColorization: { enabled: values['editor.bracketPairColorization.enabled'] },
    minimap: { enabled: values['editor.minimap.enabled'] },
    rulers: values['editor.rulers'],
    padding: { top: values['editor.padding.top'] },

    wordWrap,
    wordWrapColumn: values['editor.wordWrapColumn'],
    tabSize: values['editor.tabSize'],
    insertSpaces: values['editor.insertSpaces'],
    wordSeparators: values['editor.wordSeparators'],
    cursorStyle: values['editor.cursorStyle'],
    cursorBlinking: values['editor.cursorBlinking'],
    cursorSurroundingLines: values['editor.cursorSurroundingLines'],
    scrollBeyondLastLine: values['editor.scrollBeyondLastLine'],

    // 横スクロールバーの表示は折り返しの設定から決まる。
    // 折り返さない設定にしたまま隠すと、右にはみ出した行へ到達する手段が無くなる。
    // 設定項目を 1 つ増やすより、折り返しの設定から導出するほうが説明が少なくて済む。
    //
    // 太さと影は設定にしないと決めたものだが、`editor.ts` ではなくここに置く。
    // `updateOptions` は `scrollbar` をオブジェクトごと差し替えるため、分けて書くと設定変更のたびに既定値へ戻る。
    scrollbar: {
      horizontal: wordWrap === 'off' ? 'auto' : 'hidden',
      verticalScrollbarSize: SCROLLBAR_SIZE,
      horizontalScrollbarSize: SCROLLBAR_SIZE,
      // 端に着く前に影を出す挙動はプレビュー側に無い。色だけ揃えても差が残る。
      useShadows: false,
    },
  };
}

/**
 * フォント名。空欄のときはトークン層のコードフォントを使う。
 *
 * `--mx-font-code` は `preview.codeFontFamily` を先頭に追加した後の値であるため、エディター側を指定していない場合はプレビューのコードブロックと同じフォントになる。
 *
 * 指定があるときに既定のスタックを後ろへ追加するのは `applyAppearance` と同じ理由で、そのフォントに含まれない文字（日本語 / 記号）のフォールバック先を残すためである（F-CONF-04）。
 */
function fontFamily(values: Settings): string {
  const family = formatFontFamily(values['editor.fontFamily']);
  if (family === null) return readValue('--mx-font-code');
  return `${family}, ${readValue('--mx-font-code-stack')}`;
}

/** 現在の設定をエディターへ適用する。 */
export function applyEditorOptions(editor: monaco.editor.IStandaloneCodeEditor): void {
  editor.updateOptions(editorOptions(settingsStore.values));
}
