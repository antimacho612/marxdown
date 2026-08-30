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
 * エディタは 1 打鍵ごとに `markDirty()` を呼ぶ。**値が変わらなければ何もしない**ので、
 * IPC もストアへの書き込みも打鍵ごとには走らない。
 */
import { getPlatform } from '@/platform';

import { documentStore } from './store.svelte';

export function setDirty(dirty: boolean): void {
  if (documentStore.isDirty === dirty) return;
  documentStore.isDirty = dirty;
  void getPlatform().setDirty(dirty);
}

/** 本文が変わった。エディタの `updateListener` から呼ばれる。 */
export function markDirty(): void {
  setDirty(true);
}

/** ディスクと一致した。保存の成功と、開く / 読み直しの完了で呼ばれる。 */
export function markClean(): void {
  setDirty(false);
}
