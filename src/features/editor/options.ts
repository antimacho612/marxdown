/**
 * 設定を Monaco のオプションに写す（`editor` チャンク / F-CONF-04 / ADR-0012）。
 *
 * # ここは「写像」だけを持つ
 *
 * 値の検証（範囲・型）は Rust 側（`settings/schema.rs`）と `appearance.ts` の `LIMITS` が
 * 済ませている。**このファイルで再検証しない。** 3 か所目の判断が生えると、
 * どれが本当の上限なのかが読めなくなる。
 *
 * # 設定に出さないものは `editor.ts` に残す
 *
 * `editor.create()` に直接書いてあるオプションは、**設定にしないと決めたもの**である。
 * 理由は 3 つに分かれる（`editor.ts` の該当箇所にそれぞれ書いてある）。
 *
 * ```text
 * N-CMP-03  触っていないバイト列を変える機能（formatOnPaste / autoIndent など）
 * Non-goal  IDE に寄る機能（補完・言語サービス）。editor worker を起こす経路でもある
 * 禁則      09-motion.md（smoothScrolling）や独自機能との衝突（mouseWheelZoom）
 * ```
 *
 * **迷ったら `editor.ts` に置く。** 設定は増やすより減らすほうが難しい。
 *
 * # トークンから引くのは 2 つだけ
 *
 * 表示倍率（`--mx-zoom` / F-VIEW-11）と、`editor.fontFamily` が空のときの
 * 落とし先（`--mx-font-code`）。どちらも CSS 側にしか無い値なので、
 * `theme.ts` の読み出し層を通す。
 *
 * # 購読は隣のファイルにある
 *
 * 設定の変化を拾う `watchEditorSettings` は `watch-settings.svelte.ts` にある。
 * **ルーン（`$effect.root`）を使うファイルだけを分けてある。**
 * こちらが素の `.ts` でいられると、写像のテストが Svelte のコンパイルも
 * Monaco の読み込みも通さずに済む（`options.dom.test.ts`）。
 */
import { formatFontFamily } from '@/features/settings/appearance';
import { settingsStore } from '@/features/settings/store.svelte';
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
 * エディタ側を指定していない人には M2 までと同じフォントが出る。
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
