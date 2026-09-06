/**
 * 本文のテキストの置き場所（ADR-0005 / 02.architecture/08-state-management.md §1）。
 *
 * 本文はストアに置かないという不変条件のため、`$state` を使わないモジュール変数で保持する。
 * 保持するのはエディターが未マウントの間だけで、マウント後は Monaco の `ITextModel` が保持する（`attachEditor` の時点でこちら側の保持分を破棄し、二重に持たない）。
 * エディター側が読み書きの口を登録する形にすることで、`main` チャンクは Monaco に依存せずに済む。
 */

/** エディターがマウントされているときの読み書き口。`features/editor/` が登録する。 */
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

/** エディターがマウントされていない間の保持先。マウントされたら `null` に戻す。 */
let held: string | null = null;

let port: EditorTextPort | null = null;

/**
 * 読み込んだ本文を渡す。`open.ts` が開くたびに呼ぶ。
 *
 * エディターが載っていれば、そちらの内容も差し替える。
 *
 * 未保存の変更の確認はここでは行わない。
 * 確認は呼び出し側（`openPath` / `newDocument`）の `confirmDiscard()` が担当する（02.architecture/08-state-management.md §3）。
 */
export function setDocumentText(text: string): void {
  if (port) {
    port.replace(text);
    held = null;
    return;
  }
  held = text;
}

/** 現在の本文。エディターがマウントされていれば、そちらの内容を返す。 */
export function getDocumentText(): string {
  if (port) return port.read();
  return held ?? '';
}

/**
 * いまの内容をダーティ判定の基準にする。`dirty.ts` の `markClean()` から呼ばれる。
 *
 * エディターがマウントされていなければ何もしない。
 * 打鍵によるダーティはエディター経由でしか発生しないため、基準を持つ必要がない。
 */
export function syncDocumentText(): void {
  port?.sync();
}

/**
 * エディターの読み書き口を登録する。こちら側の保持分はここで破棄する。
 *
 * 登録する側（`features/editor/lazy/editor.ts`）は、`getDocumentText()` で初期内容を受け取ってから呼ぶこと。
 * 順序を逆にすると空の本文でマウントされる。
 */
export function attachEditor(next: EditorTextPort): void {
  port = next;
  held = null;
}

/**
 * 登録を解除する。解除する前の内容をこちら側の保持先へ戻す。
 *
 * 呼ぶのはエディターを破棄するときだけである（タブを閉じる / M3）。
 * モードを Preview へ切り替えただけでは解除しない。
 * 解除すると Undo 履歴が失われ、03.ux-spec/02-view-modes.md §4 の「モードを切り替えても保持する」を満たせなくなる。
 */
export function detachEditor(): void {
  if (!port) return;
  held = port.read();
  port = null;
}

/** テスト用。保持している本文と登録済みの読み書き口を破棄する。 */
export function resetDocumentText(): void {
  held = null;
  port = null;
}
