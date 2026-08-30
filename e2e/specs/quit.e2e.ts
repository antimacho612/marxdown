/**
 * 終了時の確認（F-EDIT-03 / 03.ux-spec/07-status-and-notifications.md §1）。
 *
 * # ここで確かめられること / られないこと
 *
 * 確認は**ネイティブのモーダルダイアログ**（`src-tauri/src/close.rs`）で、
 * WebDriver からはボタンを押せない。3 択のどれを押すとどうなるかは、
 * ここでは確かめられない。
 *
 * **確かめられるのは、その手前の一番危ない継ぎ目である。**
 *
 * ```text
 * フロントの isDirty → set_dirty（IPC）→ AppState → request_quit の分岐
 * ```
 *
 * ここが繋がっていないと、**未保存のまま黙って終了する**。
 * 単体テストはフロント側の `setDirty` が呼ばれたことしか見ておらず、
 * Rust に届いているかは見ていない。
 */
import { Key } from 'webdriverio';

import { enterEditMode, isDirtyShown, openViaForward, typeAtEnd } from '../helpers/app';
import { WORK_DOC } from '../helpers/fixtures';
import { isAppRunning } from '../helpers/process';

describe('未保存のまま終了しようとしたとき', () => {
  before(async () => {
    await openViaForward(WORK_DOC, '本文です。');
    await enterEditMode();
  });

  it('Ctrl+Q で終了せず、プロセスが残る', async () => {
    await typeAtEnd('未保存');
    await browser.waitUntil(() => isDirtyShown(), { timeout: 10_000, timeoutMsg: '未保存の印が出なかった' });

    expect(isAppRunning()).toBe(true);

    // ここから先、確認ダイアログがモーダルで載るので **WebView は応答しなくなる**。
    // 画面を見に行かず、プロセスが生きていることだけを外から確かめる。
    await browser.keys([Key.Control, 'q']);

    // 終わってしまうなら 3 秒あれば終わる（`close::quit` は同期的に `exit(0)`）。
    await new Promise((resolve) => setTimeout(resolve, 3000));
    expect(isAppRunning()).toBe(true);
  });
});
