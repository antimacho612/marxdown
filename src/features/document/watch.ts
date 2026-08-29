/**
 * 開いているファイルの外部変更を画面に反映する（F-EDIT-16 / N-REL-02）。
 *
 * # なぜ自動で読み直すのか
 *
 * 03.ux-spec/07-status-and-notifications.md §2 は外部変更に 2 つの出方を用意している。
 *
 * ```text
 * 情報: 「外部の変更を読み込みました」                    → 3 秒で自動消滅
 * 選択: 「ファイルが外部で変更されました」+ 再読み込み / 無視 → 消えない
 * ```
 *
 * **編集機能が入るのは M2 である。** それまでは失われるものが何も無いのだから、
 * 読み直すかどうかを人に尋ねる理由がない。ここは前者に倒す。
 *
 * 後者（選択）は**ダーティな本文があるとき**のもので、M2 で編集が入ってから
 * `documentStore.isDirty` を見て分岐させる。そのときも「ダーティでなければ黙って
 * 読み直す」は残す。中心ユースケース（LLM が書き換えたファイルを開いたまま眺める）が
 * 成立しなくなるため。
 *
 * # 監視そのものは Rust 側
 *
 * デバウンス（300ms）と自己イベントの排除は `src-tauri/src/watch.rs` が済ませてある。
 * ここに届くのは「実体が変わった」ことが確定したイベントだけなので、
 * タイマーもポーリングも要らない（05.performance-budget/04-targets.md §5）。
 */
import { ja } from '@/i18n/ja';
import { getPlatform } from '@/platform';

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
    // エディタが一時ファイル経由で置き換えた場合は直後に作り直されて
    // もう一度通知が出る。**消えたことは通知もしない**。
    // 本文は画面に残っており、ユーザーが困っているとは限らない。
    if (change.kind === 'removed') return;

    reloadFromDisk();
  });
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
