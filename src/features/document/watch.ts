/**
 * 開いているファイルの外部変更を画面に反映する（F-EDIT-16 / N-REL-02）。
 *
 * 分岐はダーティかどうかだけである（02.architecture/08-state-management.md §3）。
 * Clean なら黙って読み直して控えめに通知し、Dirty なら何もせず消えないバーで選ばせる（入力を失わないため）。
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
 * **落としてはいけない。** 読み終えた内容にその変更が入っている保証は無く、
 * 落とすと次に何かが起きるまで画面が古いまま止まる。
 */
let missedChange = false;

/**
 * 外部変更の購読を始める。起動時に 1 回だけ呼ぶ。
 *
 * IPC を伴う購読なので、**`ready()` の後**に呼ぶこと（02.architecture/05-startup-sequence.md §1）。
 * 監視の登録そのものは `open.ts` が開くたびに行う。
 */
export function installFileWatch(): void {
  getPlatform().onFileChanged((change) => {
    // いま開いているファイル以外は無視する。開き直した直後に、
    // 前のファイルの残りイベントが届くことがある。
    if (change.path !== documentStore.meta?.path) return;

    // 消えたファイルは読みに行かない。読みに行くと「開けません」が出て、
    // エディターが一時ファイル経由で置き換えた場合は直後に作り直されて
    // もう一度通知が出る。**消えたことは通知もしない**。
    // 本文は画面に残っており、ユーザーが困っているとは限らない。
    if (change.kind === 'removed') return;

    // 未保存の変更があるなら、**読み直さずに選ばせる**（N-REL-02）。
    // ここで自動再読み込みすると、ユーザーが打った内容が黙って消える。
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

/** 編集内容を捨てて読み直す。**押した人が承知のうえで選んでいる。** */
async function discardAndReload(): Promise<void> {
  markClean();
  await reloadCurrent({ notice: ja.open.reloadedExternal });
}

function reloadFromDisk(): void {
  if (reloading) {
    missedChange = true;
    return;
  }
  reloading = true;
  missedChange = false;

  void reloadCurrent({ notice: ja.open.reloadedExternal }).finally(() => {
    reloading = false;
    // 読んでいる間に届いた変更を拾い直す。新しいイベントが来ない限り
    // ここは 1 回で止まる（`missedChange` を立てるのはイベントだけ）。
    if (missedChange) reloadFromDisk();
  });
}
