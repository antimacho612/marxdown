/**
 * タブをサテライトへ移す（F-OPEN-06 / ADR-0016）。
 *
 * ここでしか確かめられないのは、ウィンドウの生成が呼び出し元の IPC を止めないことである。
 * Windows では同期コマンドの中でウィンドウを生成すると WebView2 がデッドロックし、呼び出し元のウィンドウの IPC と遅延チャンクの読み込みが止まる（`commands::open_satellite`）。
 * 画面の描画は続くため、モックした単体テストでは検出できない。
 *
 * タブを窓の外へドラッグする経路は再現できない。WebDriver はポインタをビューポートの外へ動かせない。
 * 同じ `moveTabToSatellite` を通る、コマンドパレットの「別ウィンドウで開く」から呼ぶ。
 */
import { Key } from 'webdriverio';

import { openViaForward } from '../helpers/app';
import { WORK_DOC } from '../helpers/fixtures';

describe('タブをサテライトへ移す', () => {
  let main = '';

  before(async () => {
    await openViaForward(WORK_DOC, '本文です。');
    main = await browser.getWindowHandle();
  });

  it('パレットから移すと、サテライトが開いて本文が移る', async () => {
    await browser.keys([Key.Control, Key.Shift, 'p']);
    await browser.waitUntil(
      async () => browser.execute(() => document.querySelectorAll('.mx-palette__list button').length > 0),
      { timeout: 20_000, timeoutMsg: 'パレットが開かなかった' },
    );
    await browser.keys('別ウィンドウ');
    await browser.keys([Key.Enter]);

    let handles: string[] = [];
    await browser.waitUntil(
      async () => {
        handles = await browser.getWindowHandles();
        return handles.length === 2;
      },
      { timeout: 20_000, timeoutMsg: 'サテライトが開かなかった' },
    );

    const satellite = handles.find((handle) => handle !== main);
    if (satellite === undefined) throw new Error('サテライトのハンドルが取れなかった');

    await browser.switchToWindow(satellite);
    await browser.waitUntil(
      async () => {
        const text = await browser.execute(() => document.querySelector('#mx-preview .mx-content')?.textContent ?? '');
        return text.includes('本文です。');
      },
      { timeout: 20_000, timeoutMsg: 'サテライトに本文が出なかった' },
    );
    await browser.switchToWindow(main);
  });

  it('元のウィンドウは Welcome に戻る', async () => {
    await browser.waitUntil(async () => browser.execute(() => document.querySelector('.mx-welcome') !== null), {
      timeout: 10_000,
      timeoutMsg: '元のウィンドウが Welcome に戻らなかった',
    });
  });

  it('元のウィンドウで遅延チャンクを読み込める', async () => {
    // メニューの中身は遅延チャンクにある（`app/MenuButton.svelte`）。
    // チャンクの取得も IPC と同じく WebView2 のイベントを通るため、デッドロックしていればここで止まる。
    await $('.mx-menubutton__button').click();

    await browser.waitUntil(async () => browser.execute(() => document.querySelector('.mx-menu') !== null), {
      timeout: 10_000,
      timeoutMsg: 'メニューが開かなかった',
    });
    await browser.keys([Key.Escape]);
  });
});
