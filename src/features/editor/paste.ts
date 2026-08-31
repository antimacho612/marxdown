/**
 * URL のスマートペースト（F-EDIT-12 / `editor` チャンク）。
 *
 * > 選択範囲への URL 貼り付けで `[選択文字](URL)` になる
 *
 * # ここも CodeMirror では書かなくてよかった
 *
 * `@codemirror/lang-markdown` の `pasteURLAsLink` が既定で持っていた
 * （[ADR-0009](../../../docs/adr/0009-editor-engine-monaco.md) の受け入れコスト 1）。
 *
 * # `onDidPaste` ではなく DOM の `paste` を捕まえる
 *
 * Monaco の `onDidPaste` は**貼り終わってから**飛ぶ。そこで直そうとすると
 * 「URL を貼る」と「リンクに直す」で Undo が 2 回に割れるうえ、
 * 貼る前の選択範囲（＝リンクテキストになるはずのもの）は既に消えている。
 *
 * DOM の `paste` を先に捕まえて `preventDefault()` すれば、**1 回の編集**で済む。
 *
 * # 貼るのが URL でなければ手を出さない
 *
 * 判定は**スキーム付きで空白を含まない 1 行**に限る。ここを緩めると、
 * ただの文字列を貼っただけでリンクにされて驚くことになる。
 * リンクを**打つ**ほうは `format.ts` の `insertLink`（`Ctrl+K`）。
 */
import { byRange, runEdit, textAt, type MarkdownEdit } from './edits';
import type { monaco } from './monaco';

/**
 * 貼られた文字列が URL か。
 *
 * `https://` のようにスキームと `//` を持ち、空白を含まない 1 行だけを通す。
 * `mailto:` のような `//` を持たないスキームは通さない。**判断に迷う入力は
 * 何もしないほうがよい**（Principle 3: 押す前に結果が読める）。
 */
export function isPastedUrl(text: string): boolean {
  return /^[a-z][\d+.a-z-]*:\/\/\S+$/iu.test(text.trim());
}

/** 選択範囲をリンクテキストにして、貼られた URL を宛先にする。 */
export function linkFromUrl(url: string): MarkdownEdit {
  return (model, selections) =>
    byRange(model, selections, ({ from, to }) => {
      const text = textAt(model, from, to);
      const inserted = `[${text}](${url})`;
      return {
        edits: [{ from, to, text: inserted }],
        // カーソルは貼った結果の後ろ。続けて打てる。
        select: { from: from + inserted.length, to: from + inserted.length },
      };
    });
}

/**
 * 貼り付けを見張る。**`mountEditor` から 1 回だけ呼ぶ。**
 *
 * 選択が無いとき・複数カーソルのとき・URL でないときは**何もしない**ので、
 * 普通の貼り付けはそのまま Monaco に流れる。
 */
export function installUrlPaste(editor: monaco.editor.IStandaloneCodeEditor): void {
  const node = editor.getDomNode();
  if (!node) return;

  node.addEventListener(
    'paste',
    (event) => {
      const url = event.clipboardData?.getData('text/plain')?.trim() ?? '';
      if (!isPastedUrl(url)) return;

      const selections = editor.getSelections() ?? [];
      const main = selections[0];
      // **複数カーソルでは手を出さない。** 同じ URL を複数箇所に貼るのは
      // 「リンクにしたい」より「そのまま貼りたい」ことのほうが多い。
      if (selections.length !== 1 || !main || main.isEmpty()) return;

      event.preventDefault();
      // **`preventDefault()` だけでは足りない。** Monaco はブラウザの既定に任せず、
      // 自分のハンドラで `clipboardData` を読んで貼る。捕獲フェーズで先に走っても
      // 伝播を止めなければ**そのあと素の URL がもう一度貼られる**（実測で確認）。
      event.stopPropagation();
      runEdit(editor, linkFromUrl(url), 'markdown.paste');
    },
    // **捕獲フェーズで受ける。** Monaco 自身のハンドラは内側のノードに付いているので、
    // 外側の捕獲で先に捕まえないと止められない。
    { capture: true },
  );
}
