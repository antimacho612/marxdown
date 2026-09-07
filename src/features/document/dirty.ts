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

/**
 * 本文がディスクと違うか。**合成前の値**である。
 *
 * タブを切り替えるときの退避と復元に要る（`features/workspace/tabs.svelte.ts`）。
 * 合成後の `documentStore.isDirty` からは源を分けられないため、これが無いと
 * 「EOL だけ変えたタブ」を復元したときに本文側のダーティが立ってしまう。
 */
export function isTextDirty(): boolean {
  return textDirty;
}

/** 本文がディスクと違うかを設定する。合成後の値は `refreshDirty` が決める。 */
export function setDirty(dirty: boolean): void {
  textDirty = dirty;
  refreshDirty();
}

/**
 * 源のどれかが変わったので、ダーティ状態を出し直す。
 *
 * 値が変わらなければ何もしない。
 * エディターは 1 打鍵ごとにここを通るため、打鍵ごとにストアへ書き込んだり IPC を発行したりしないようにしている。
 */
export function refreshDirty(): void {
  // `eol.ts` を import しない。`eol.ts` は変換を担当する側であり、こちらを呼び出す。
  // 判定に必要なのは変換の指定が置かれているかどうかだけであるため、ストアを直接参照して循環を避ける。
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
 * ここでダーティ判定の基準も更新する。
 * 更新しないと、保存した後に Undo で保存直前の内容まで戻してもダーティのままになる。
 *
 * 改行コードの変換指定も破棄する。
 * 保存できた場合は書き戻し済みであり、開き直した場合は別のファイルであるため、どちらでも引き継ぐ必要がない。
 */
export function markClean(): void {
  textDirty = false;
  documentStore.eolOverride = null;
  refreshDirty();
  syncDocumentText();
}
