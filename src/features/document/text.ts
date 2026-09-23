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
  /**
   * 文書を切り替える。
   *
   * `key` はタブ、`documentId` は文書の同一性（パス）を表す。
   * この 2 つが同じなら同じ編集の続きであり、Undo 履歴もカーソルも引き継ぐ。
   * どちらかが変われば別の文書であり、履歴を引き継いではいけない。
   *
   * 引き継ぐと、Undo で別のファイルの本文が編集面へ入る。
   * そのまま保存すれば、触っていない箇所どころかファイル全体が別物になる（N-CMP-03）。
   */
  switchTo: (key: number, documentId: string, text: string) => void;
  /**
   * 1 行だけ差し替える（F-VIEW-01）。
   *
   * 全体を差し替える `replace` と分けてある。
   * `huge.md` でチェックボックスを 1 つ押すたびに全文を置き換えると、その 1 回ごとに再トークナイズが丸ごと発生する。
   *
   * @param line 0 始まりの行番号。
   */
  replaceLine: (line: number, text: string) => void;
  /** そのタブが保持しているものを解放する（タブを閉じたとき / N-PERF-06）。 */
  dispose: (key: number) => void;
}

/** エディターがマウントされていない間の保持先。マウントされたら `null` に戻す。 */
let held: string | null = null;

let port: EditorTextPort | null = null;

/**
 * いま開いている文書の識別（`DocumentIdentity`）。
 *
 * 覚えておくのは、エディターは後からマウントされるためである。
 * 既定の表示モードは Preview であり（02.architecture/05-startup-sequence.md §1）、`Ctrl+Shift+V` を押した時点で「どのタブのどの文書か」を伝え直す必要がある。
 */
let current: DocumentIdentity | null = null;

/** 文書が決まっていないときの受け皿。タブ id は 1 から始まるので衝突しない。 */
const NO_DOCUMENT: DocumentIdentity = { key: 0, documentId: '<none>' };

/**
 * 読み込んだ本文を渡す。`open.ts` が開くたびに呼ぶ。
 *
 * エディターがマウントされていれば、そちらの内容も差し替える。
 *
 * 未保存の変更の確認はここでは行わない。
 * 確認は呼び出し側（`openPath` / `newDocument`）の `confirmDiscard()` が担当する（02.architecture/08-state-management.md §3）。
 */
export function setDocumentText(text: string, document: DocumentIdentity | null = null): void {
  if (document !== null) current = document;

  if (port) {
    if (document === null) port.replace(text);
    else port.switchTo(document.key, document.documentId, text);
    held = null;
    return;
  }
  held = text;
}

/** どのタブのどの文書か。エディターがモデルを分ける単位である（`EditorTextPort.switchTo`）。 */
export interface DocumentIdentity {
  /** タブ。1 タブ 1 モデルであり、切り替えても閉じるまで残る。 */
  key: number;
  /** 文書の同一性。パスを使い、無題の文書は `<untitled>` で表す。 */
  documentId: string;
}

/** そのタブが保持しているものを解放する。タブを閉じたときに呼ぶ（N-PERF-06）。 */
export function disposeDocumentText(key: number): void {
  port?.dispose(key);
}

/**
 * 1 行だけ差し替える（`features/document/task.ts`）。
 *
 * エディターがマウントされていればそちらへ渡し、Undo の 1 手として加える。
 * マウントされていなければこちらの保持分を書き換える。
 *
 * ダーティ化はここでは行わない。
 * エディター経由なら `onDidChangeContent` からダーティになるため、ここでも行うと経路によって二重になる。
 *
 * @returns 差し替えたら `true`。行が存在しなければ `false`。
 */
export function replaceDocumentLine(line: number, text: string): boolean {
  if (port) {
    port.replaceLine(line, text);
    return true;
  }

  const lines = (held ?? '').split('\n');
  if (lines[line] === undefined) return false;
  lines[line] = text;
  held = lines.join('\n');
  return true;
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

  // マウント時点で開いている文書を渡す。
  // エディターは自分がどのタブのものかを知らないため、ここで伝える（`current`）。
  const identity = current ?? NO_DOCUMENT;
  next.switchTo(identity.key, identity.documentId, held ?? '');
  held = null;
}

/**
 * 登録を解除する。解除する前の内容をこちら側の保持先へ戻す。
 *
 * 呼ぶのはエディターを破棄するときだけである。
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
  current = null;
}
