/**
 * 未保存の変更があるか（F-EDIT-03 / 03.ux-spec/07-status-and-notifications.md §1）。
 *
 * `save.ts` から分けてあるのは依存の向きが逆だからである（open/editor/watch はダーティを触るだけで保存を知らず、save はダーティを clean にしつつ open を使う）。
 * ここに置くと `save.ts` ⇄ `open.ts` の循環になる。
 *
 * トレイメニューからの終了はフロントを経由しないため（`src-tauri/src/close.rs`）、変わり目だけ Rust へも知らせる。
 */
import { getPlatform } from '@/platform';

import { documentStore } from './store.svelte';
import { syncDocumentText } from './text';

/**
 * 本文がディスクと違うか。
 *
 * ダーティの源は 1 つではない。
 * 本文の他に、改行コードの変換（`document/eol.ts` / 03.ux-spec/07-status-and-notifications.md §3）がある。
 * 両方を 1 つの boolean に統合すると、例えば「LF → CRLF に変換してダーティが立った後、何か打って Undo で本文だけ基準に戻す」場合、そこで false を代入したときに CRLF の希望が残っているのにダーティが外れてしまう。
 * 源ごとに持ち、出力時に合成する。
 */
let textDirty = false;

export function setDirty(dirty: boolean): void {
  textDirty = dirty;
  refreshDirty();
}

/**
 * 源のどれかが変わったので、ダーティ状態を出し直す。
 *
 * **値が変わらなければ何もしない。** 打鍵ごとにストアへ書いたり IPC を出したり
 * しないための門で、エディターは 1 打鍵ごとにここへ来る。
 */
export function refreshDirty(): void {
  // **`eol.ts` を import しない。** あちらは変換の意味を持つ側で、こちらを呼ぶ。
  // 判定に要るのは「希望が置かれているか」だけなので、ストアを直接見て循環を避ける。
  const dirty = textDirty || documentStore.eolOverride !== null;
  if (documentStore.isDirty === dirty) return;
  documentStore.isDirty = dirty;
  void getPlatform().setDirty(dirty);
}

/** 本文が変わった。エディターの `onDidChangeContent` から呼ばれる。 */
export function markDirty(): void {
  setDirty(true);
}

/**
 * ディスクと一致した。保存の成功と、開く / 読み直しの完了で呼ばれる。
 *
 * **ここでダーティ判定の基準も動かす。** 動かさないと、保存した後に Undo で
 * 保存直前の内容まで戻ってもダーティのままになる。
 *
 * 改行コードの希望も落とす。**保存できたなら書き戻し済みで、
 * 開き直したなら別のファイルの話**なので、どちらでも持ち越す意味が無い。
 */
export function markClean(): void {
  textDirty = false;
  documentStore.eolOverride = null;
  refreshDirty();
  syncDocumentText();
}
