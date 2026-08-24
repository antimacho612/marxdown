/**
 * 最近開いたファイル（F-OPEN-03 / F-OPEN-09）。
 *
 * 真実は Rust 側の永続化ストア（`src-tauri/src/store.rs`）にあり、ここはその写し。
 * 初期値は bootstrap に同梱されて届くので、Welcome 画面は**起動直後に**描ける。
 * IPC で取りに行く設計にすると、引数なし起動のたびに空の画面が 1 フレーム挟まる。
 *
 * 更新系のコマンドは更新後の一覧を返す。追加のたびに読み直す往復を省くため。
 */
import { getPlatform, type RecentEntry } from '@/platform';

class RecentStore {
  entries = $state<RecentEntry[]>([]);
}

export const recentStore = new RecentStore();

/**
 * 開いたファイルを記録する。
 *
 * **失敗しても呼び出し側に伝えない。** 履歴に残せなかったことでファイルを開く操作を
 * 失敗扱いにする理由がない。本文はもう画面に出ている。
 */
export async function rememberRecent(path: string): Promise<void> {
  try {
    recentStore.entries = await getPlatform().pushRecent(path);
  } catch {
    // 記録できなくても、開く操作そのものは成功している
  }
}

/**
 * 履歴から外す。
 *
 * 開けなかったファイルに対して呼ぶ。消えたファイルを一覧に残し続けると、
 * 次の起動でも同じ失敗を踏むことになる。
 */
export async function forgetRecent(path: string): Promise<void> {
  try {
    recentStore.entries = await getPlatform().removeRecent(path);
  } catch {
    // 同上
  }
}
