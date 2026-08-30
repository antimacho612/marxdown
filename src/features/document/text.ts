/**
 * 本文のテキストの置き場所（ADR-0005 / 02.architecture/08-state-management.md §1）。
 *
 * # なぜストアではないのか
 *
 * 「エディタのテキスト本体はストアに置かない」が不変条件だから。
 * 1 打鍵ごとに巨大な文字列がリアクティビティを通過すると、入力レスポンス 16ms を満たせない。
 * ここは**素のモジュール変数**で、`$state` を一切使わない。
 * `documentStore` が持つのは `isDirty` のような派生値だけという関係は変わらない。
 *
 * # なぜ器が要るのか
 *
 * Markdown テキストが唯一の真実である以上、**それを誰かが持っていなければならない**。
 * 持ち主は状況で変わる。
 *
 * ```text
 * エディタが載っていない（Preview だけで読んでいる） → ここが持つ
 * エディタが載っている                              → CodeMirror の EditorState が持つ
 * ```
 *
 * 後者では二重に持たない。`attachEditor` の時点でこちらの控えを捨てる。
 * `huge.md`（2MB）で 2MB 余計に握り続けることになり、常駐アプリでは積算する。
 *
 * # なぜ関数で受け渡すのか
 *
 * このモジュールは `main` チャンクにいる。CodeMirror を直接 import すると
 * `editor` チャンク（203KB）がクリティカルパスに載る。
 * エディタ側から**自分の読み書き口を登録してもらう**ことで、
 * ここは CodeMirror の存在を知らないままでいられる。
 */

/** エディタが載っているときの読み書き口。`features/editor/` が登録する。 */
export interface EditorTextPort {
  read: () => string;
  /** ディスクの内容で置き換える（開き直し / 別のファイルを開く）。 */
  replace: (text: string) => void;
}

/** エディタが載っていないあいだの控え。載ったら `null` に戻す。 */
let held: string | null = null;

let port: EditorTextPort | null = null;

/**
 * 読み込んだ本文を渡す。`open.ts` が開くたびに呼ぶ。
 *
 * エディタが載っていれば、そちらの内容も差し替える。
 *
 * > **未保存の変更を確認せずに差し替える。** 保存とダーティ状態が入るのは
 * > Phase 2 で、そこで `documentStore.isDirty` を見て分岐させる
 * > （02.architecture/08-state-management.md §3「外部変更時の挙動」）。
 */
export function setDocumentText(text: string): void {
  if (port) {
    port.replace(text);
    held = null;
    return;
  }
  held = text;
}

/** いまの本文。エディタが載っていればそちらが真実。 */
export function getDocumentText(): string {
  if (port) return port.read();
  return held ?? '';
}

/**
 * エディタの読み書き口を登録する。**控えはここで捨てる。**
 *
 * 登録する側（`features/editor/editor.ts`）は、`getDocumentText()` で
 * 初期内容を受け取ってから呼ぶこと。順序を逆にすると空の本文で載る。
 */
export function attachEditor(next: EditorTextPort): void {
  port = next;
  held = null;
}

/**
 * 登録を外す。**外す前の内容を控えへ戻す。**
 *
 * 呼ぶのはエディタを破棄するときだけ（タブを閉じる / M3）。
 * モードを Preview へ切り替えただけでは外さない。外すと Undo 履歴が消え、
 * 03.ux-spec/02-view-modes.md §4 の「モードを切り替えても保持する」が壊れる。
 */
export function detachEditor(): void {
  if (!port) return;
  held = port.read();
  port = null;
}

/** テスト用。 */
export function resetDocumentText(): void {
  held = null;
  port = null;
}
