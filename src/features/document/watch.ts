/**
 * 開いているファイルの外部変更を画面に反映する（F-EDIT-16 / N-REL-02）。
 *
 * 分岐はダーティかどうかだけである（02.architecture/08-state-management.md §3）。
 * Clean なら黙って読み直してステータスバーに出し、Dirty なら何もせず消えない通知バーで選ばせる（入力を失わないため）。
 * デバウンスと自己イベントの排除は Rust 側（`src-tauri/src/watch.rs`）が済ませており、ここに届くのは実体が変わったことが確定したイベントだけである。
 */
import { ja } from '@/i18n/ja';
import { getPlatform } from '@/platform';

import { markClean } from './dirty';
import { reloadCurrent } from './open';
import { documentStore } from './store.svelte';

/**
 * 読み直している最中かどうか。
 *
 * 保存が連続したときに、読み込みが終わる前の状態で次の読み込みを始めないための門。
 * デバウンス済みとはいえ、大きなファイルではパースが 300ms を越えうる。
 */
let reloading = false;

/**
 * 読み直している最中に届いた変更。
 *
 * この変更は破棄しない。
 * 読み終えた内容にその変更が含まれている保証は無く、破棄すると次のイベントが来るまで画面が古いままになる。
 */
let missedChange = false;

/**
 * 外部変更の購読を始める。起動時に 1 回だけ呼ぶ。
 *
 * IPC を伴う購読であるため、`ready()` の後に呼ぶこと（02.architecture/05-startup-sequence.md §1）。
 * 監視の登録そのものは `open.ts` が開くたびに行う。
 */
export function installFileWatch(): void {
  getPlatform().onFileChanged((change) => {
    // 現在開いているファイル以外は無視する。
    // 開き直した直後に、前のファイルのイベントが遅れて届くことがある。
    if (change.path !== documentStore.meta?.path) return;

    // 削除されたファイルは読みに行かない。
    // 読みに行くと「開けません」が表示され、エディターが一時ファイル経由で置き換えた場合は直後に作り直されてもう一度通知が出る。
    // 削除されたこと自体も通知しない。本文は画面に残っており、操作を妨げてはいないためである。
    if (change.kind === 'removed') return;

    // 未保存の変更があるなら、読み直さずに選択させる（N-REL-02）。
    // ここで自動的に再読み込みすると、入力した内容が失われる。
    if (documentStore.isDirty) {
      offerReloadChoice();
      return;
    }

    reloadFromDisk();
  });
}

/**
 * 編集中に外部変更が来たときの選択（03.ux-spec/07-status-and-notifications.md §2 の「選択」）。
 * 「ファイルが外部で変更されました」+ 再読み込み / 無視、を消えない通知として出す。
 *
 * 3 秒で消えると「気づかないまま古い内容を保存する」ことになり、
 * その保存は衝突として弾かれる（`save.ts`）。弾かれること自体は正しいが、
 * 変更があった事実は画面に残しておくほうが親切である。
 *
 * 「無視」を押してもダーティのままにする。
 * 保存すれば衝突が出て、そこでもう一度上書きか読み直しを選べる。
 * ここで clean にすると、この保護機構が働かなくなる。
 */
function offerReloadChoice(): void {
  documentStore.notice = {
    level: 'warning',
    message: ja.open.changedExternally,
    actions: [
      { label: ja.open.reloadAction, run: () => void discardAndReload() },
      { label: ja.open.ignoreAction, run: () => (documentStore.notice = null) },
    ],
  };
}

/** 編集内容を破棄して読み直す。通知バーで明示的に選ばれたときだけ呼ばれる。 */
async function discardAndReload(): Promise<void> {
  markClean();
  await reloadCurrent({ status: ja.open.reloadedExternal });
}

function reloadFromDisk(): void {
  if (reloading) {
    missedChange = true;
    return;
  }
  reloading = true;
  missedChange = false;

  void reloadCurrent({ status: ja.open.reloadedExternal }).finally(() => {
    reloading = false;
    // 読み込み中に届いた変更を処理し直す。
    // 新しいイベントが来ない限りここは 1 回で終わる（`missedChange` を立てるのはイベントだけである）。
    if (missedChange) reloadFromDisk();
  });
}
