/**
 * URL のスマートペースト（F-EDIT-12 / `editor` チャンク）。
 * 選択範囲への URL 貼り付けで `[選択文字](URL)` になる。
 * CodeMirror では `pasteURLAsLink` が既定で持っていたが Monaco には無いため自作した（ADR-0009 の受け入れコスト 1）。
 *
 * Monaco の `onDidPaste` は貼り終わってから飛ぶため、そこで直すと Undo が 2 回に割れ選択範囲も消えている。
 * DOM の `paste` を先に捕まえて `preventDefault()` すれば 1 回の編集で済む。
 * 判定はスキーム付きで空白を含まない 1 行に限り、緩めると普通の文字列貼り付けまでリンク化されてしまう。
 */
import { byRange, runEdit, textAt, type MarkdownEdit } from './edits';
import type { monaco } from './monaco';

/**
 * 貼られた文字列が URL か。
 *
 * `https://` のようにスキームと `//` を持ち、空白を含まない 1 行だけを通す。
 * `mailto:` のような `//` を持たないスキームは通さない。
 * 判定が曖昧になる入力に対しては何もしない（Principle 3: 操作前に結果を判断できる）。
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
 * 貼り付けを監視する。`mountEditor` から 1 回だけ呼ぶ。
 *
 * 選択が無いとき、複数カーソルのとき、URL でないときは何もしないため、通常の貼り付けはそのまま Monaco が処理する。
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
      // 複数カーソルのときは処理しない。
      // 同じ URL を複数箇所へ貼る操作は、リンク化ではなくそのまま貼り付ける意図であることが多い。
      if (selections.length !== 1 || !main || main.isEmpty()) return;

      event.preventDefault();
      // `preventDefault()` だけでは足りない。
      // Monaco はブラウザの既定動作に任せず、自分のハンドラで `clipboardData` を読んで貼り付ける。
      // 捕獲フェーズで先に実行しても、伝播を止めなければその後に URL がそのまま貼り付けられる（実測で確認）。
      event.stopPropagation();
      runEdit(editor, linkFromUrl(url), 'markdown.paste');
    },
    // 捕獲フェーズで受け取る。
    // Monaco 自身のハンドラは内側のノードに登録されているため、外側の捕獲フェーズで先に処理しないと止められない。
    { capture: true },
  );
}
