/**
 * 貼り付けの横取り（F-EDIT-12 / F-EDIT-13 / `editor` チャンク）。
 * 選択範囲への URL 貼り付けで `[選択文字](URL)` になる。
 * Monaco には無いため自作した（ADR-0009 の受け入れコスト 1）。
 *
 * Monaco の `onDidPaste` は貼り付けの完了後に発火するため、そこで書き換えると Undo が 2 回に分かれ、選択範囲も失われている。
 * DOM の `paste` イベントを先に受け取って `preventDefault()` すれば 1 回の編集で済む。
 * 判定はスキーム付きで空白を含まない 1 行に限り、緩めると普通の文字列貼り付けまでリンク化されてしまう。
 */
import { documentStore } from '@/features/document';
import { t } from '@/i18n';
import { getPlatform } from '@/platform';

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
 * クリップボードから取り出せる画像（F-EDIT-13）。
 *
 * `svg+xml` は含めない。中身が実行可能なマークアップであり、Rust 側も受け付けない（`src-tauri/src/asset.rs`）。
 */
const IMAGE_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

/** 貼り付けの中に画像があれば、その 1 枚目と拡張子を返す。 */
export function imageInClipboard(data: DataTransfer | null): { file: File; extension: string } | null {
  for (const file of data?.files ?? []) {
    const extension = IMAGE_TYPES[file.type.toLowerCase()];
    if (extension !== undefined) return { file, extension };
  }
  return null;
}

/** `![](path)` を組み立てる。 */
export function imageLink(relativePath: string): MarkdownEdit {
  return (model, selections) =>
    byRange(model, selections, ({ from, to }) => {
      // 選択があれば、それを代替テキストにする。URL のスマートペーストと同じ扱いである。
      const alt = textAt(model, from, to);
      const inserted = `![${alt}](${relativePath})`;
      return {
        edits: [{ from, to, text: inserted }],
        select: { from: from + inserted.length, to: from + inserted.length },
      };
    });
}

/**
 * 画像を保存してリンクを挿入する（F-EDIT-13）。
 *
 * 保存先は `<ファイル名>.assets/` に固定である（`src-tauri/src/asset.rs`）。
 * 無題の文書には基点が無いため、保存せずに知らせて終わる。
 * ここで「保存ダイアログを出す」形にすると、貼り付けという 1 動作の途中で保存の判断を求めることになる。
 */
async function pasteImage(editor: monaco.editor.IStandaloneCodeEditor, file: File, extension: string): Promise<void> {
  const path = documentStore.meta?.path ?? null;
  if (path === null || path === '') {
    documentStore.statusMessage = t.editor.pasteImageUntitled;
    return;
  }

  try {
    const data = new Uint8Array(await file.arrayBuffer());
    const relative = await getPlatform().writeAsset(path, extension, data);
    runEdit(editor, imageLink(relative), 'markdown.paste');
  } catch {
    // 書き込めなかった（容量・権限・拡張子）。本文には何も入れない。
    // 入れてから失敗を知らせると、指す先の無いリンクが残る。
    documentStore.notice = { level: 'error', message: t.editor.pasteImageFailed };
  }
}

/**
 * 貼り付けを監視する。`mountEditor` から 1 回だけ呼ぶ。
 *
 * 処理するのは 2 つだけである。選択範囲への URL（F-EDIT-12）と、画像（F-EDIT-13）。
 * どちらでもなければ何もしないため、通常の貼り付けはそのまま Monaco が処理する。
 *
 * 登録先は `editor.getDomNode()` ではなく、マウント先の要素である。
 * `mountEditor` は `model: null` でエディターを作るため（どのタブのものかは後から決まる）、この時点では Monaco がビューを構築しておらず `getDomNode()` は `null` を返す。
 * そちらに登録する形にすると登録そのものが行われず、URL の貼り付けも画像の貼り付けも動かない。
 */
export function installPaste(editor: monaco.editor.IStandaloneCodeEditor, host: HTMLElement): void {
  host.addEventListener(
    'paste',
    (event) => {
      // 画像が先。画像を貼ったときのクリップボードにはファイル名などのテキストも同時に入っていることがある。
      const image = imageInClipboard(event.clipboardData);
      if (image) {
        event.preventDefault();
        event.stopPropagation();
        void pasteImage(editor, image.file, image.extension);
        return;
      }

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
      // 捕獲フェーズで先に実行しても、伝播を止めなければその後に URL がそのまま貼り付けられる。
      event.stopPropagation();
      runEdit(editor, linkFromUrl(url), 'markdown.paste');
    },
    // 捕獲フェーズで受け取る。
    // Monaco 自身のハンドラは内側のノードに登録されているため、外側の捕獲フェーズで先に処理しないと止められない。
    { capture: true },
  );
}
