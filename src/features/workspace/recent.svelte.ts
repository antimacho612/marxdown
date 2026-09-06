/**
 * 最近開いたファイル（F-OPEN-03 / F-OPEN-09）。
 *
 * 値の所有者は Rust 側の永続化ストア（`src-tauri/src/store.rs`）であり、ここはその複製である。
 * 初期値は bootstrap に同梱されて届くため、Welcome 画面を起動直後に描画できる。
 * IPC で取得する設計にすると、引数なしの起動のたびに空の画面が 1 フレーム表示される。
 *
 * 更新系のコマンドは更新後の一覧を返す。追加のたびに読み直す往復を省くため。
 */
import { getPlatform, type RecentEntry } from '@/platform';

class RecentStore {
  entries = $state<RecentEntry[]>([]);
}

/** 最近開いたファイル。モジュールの singleton として共有する。 */
export const recentStore = new RecentStore();

/**
 * 開いたファイルを記録する。
 *
 * 失敗しても呼び出し側には伝えない。
 * 履歴に記録できなかったことを理由にファイルを開く操作を失敗扱いにする必要はない。本文は既に表示されている。
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
