/**
 * 未保存の変更があるか（F-EDIT-03 / 03.ux-spec/07-status-and-notifications.md §1）。
 *
 * # なぜ `save.ts` から分けてあるのか
 *
 * ダーティ状態を触る側と、保存そのものは**依存の向きが逆**になる。
 *
 * ```text
 * open.ts    → 開いたら clean にする        （保存は知らない）
 * editor.ts  → 打鍵したら dirty にする      （保存は知らない）
 * watch.ts   → dirty かどうかで分岐する      （保存は知らない）
 * save.ts    → 保存できたら clean にする + open.ts を使う
 * ```
 *
 * ここを `save.ts` に置くと `save.ts` ⇄ `open.ts` の循環になる。
 * **状態と操作を分けるのは、循環を避けるための都合ではなく、
 * 「誰が何を知っている必要があるか」がもともと違うから**である。
 *
 * # 変わり目だけ Rust へ知らせる
 *
 * 終了の 3 経路は Rust 側で合流しており（`src-tauri/src/close.rs`）、
 * **トレイメニューからの終了はフロントを経由しない**。確認をフロントに置くと
 * その経路だけ黙って捨てることになるので、Rust にも同じ事実を持たせる。
 *
 * エディタは 1 打鍵ごとに `setDirty()` を呼ぶ（Undo で基準に戻れば `false` も渡る）。
 * **値が変わらなければ何もしない**ので、IPC もストアへの書き込みも打鍵ごとには走らない。
 */
import { getPlatform } from '@/platform';

import { documentStore } from './store.svelte';
import { syncDocumentText } from './text';

/**
 * 本文がディスクと違うか。
 *
 * **ダーティの源は 1 つではない。** 本文の他に、改行コードの変換
 * （`document/eol.ts` / 03.ux-spec/07-status-and-notifications.md §3）がある。両方を 1 つの
 * boolean に潰してしまうと、**打鍵で相手が消える**。
 *
 * ```text
 * 1. LF → CRLF に変換した        → ダーティ
 * 2. 何か打って、Undo で戻した    → 本文は基準と同じ
 * 3. そこで false を代入すると…  → CRLF の希望が残っているのにダーティが外れる
 * ```
 *
 * 源ごとに持ち、**出すときに合成する**。
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
 * しないための門で、エディタは 1 打鍵ごとにここへ来る。
 */
export function refreshDirty(): void {
  // **`eol.ts` を import しない。** あちらは変換の意味を持つ側で、こちらを呼ぶ。
  // 判定に要るのは「希望が置かれているか」だけなので、ストアを直接見て循環を避ける。
  const dirty = textDirty || documentStore.eolOverride !== null;
  if (documentStore.isDirty === dirty) return;
  documentStore.isDirty = dirty;
  void getPlatform().setDirty(dirty);
}

/** 本文が変わった。エディタの `onDidChangeContent` から呼ばれる。 */
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
