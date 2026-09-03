/**
 * 本文のテキストの置き場所（ADR-0005 / 02.architecture/08-state-management.md §1）。
 *
 * 本文はストアに置かない不変条件のため、`$state` を使わない素のモジュール変数で持つ。
 * 持ち主はエディタ未マウント時はここ、マウント後は CodeMirror の `EditorState` になる（`attachEditor` 時点でこちらの控えを破棄し、二重に持たない）。
 * エディタ側が自分の読み書き口を登録する形にすることで、`main` チャンクは CodeMirror の存在を知らずに済む。
 */

/** エディタが載っているときの読み書き口。`features/editor/` が登録する。 */
export interface EditorTextPort {
  read: () => string;
  /** ディスクの内容で置き換える（開き直し / 別のファイルを開く）。 */
  replace: (text: string) => void;
  /**
   * いまの内容をダーティ判定の基準にする（`markClean()` から呼ばれる）。
   * Undo でこの基準まで戻ってきたときにダーティを解除できるようにする。
   */
  sync: () => void;
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
 * いまの内容をダーティ判定の基準にする。`dirty.ts` の `markClean()` から呼ばれる。
 *
 * エディタが載っていなければ何もしない。打鍵によるダーティは
 * エディタ経由でしか起きないため、基準を持つ必要もない。
 */
export function syncDocumentText(): void {
  port?.sync();
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
