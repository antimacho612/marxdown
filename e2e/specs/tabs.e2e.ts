/**
 * タブ（F-NAV-01, 02 / M3 Phase 2）。
 *
 * **ここでしか確かめられないのは 2 つ。**
 *
 * 1 つは argv 転送がタブを増やすこと。単一インスタンスの 2 回目の起動（`forwardOpen`）は
 * 本物のプロセスを立てないと再現できず、Vitest 側はプラットフォームをモックしている。
 *
 * もう 1 つはキーの取り合いである。`Ctrl+W` はブラウザではウィンドウを閉じるキー、
 * `Ctrl+Tab` はフォーカス移動のキーで、どちらも既定動作を止めないと窓ごと消える。
 * アプリのグローバルキーとエディターのキーバインドが同じキーを取り合っていないことは、
 * 本物のキーイベントを流さないと確かめられない（`e2e/README.md`）。
 */
import { Key } from 'webdriverio';

import { editorText, enterEditMode, openViaForward, typeAtEnd } from '../helpers/app';
import { WORK_DOC, writeFile } from '../helpers/fixtures';

/**
 * もう 1 枚開くための別ファイル。作業ファイルと同じ場所に置く。
 *
 * `onPrepare` が作り直すのは `doc.md` の 1 枚だけなので（`helpers/fixtures.ts`）、こちらはこの spec が作る。
 */
const SECOND_DOC = WORK_DOC.replace('doc.md', 'second.md');

/** タブの枚数。1 枚のときはタブバー自体が無いので 0 になる。 */
async function tabCount(): Promise<number> {
  return browser.execute(() => document.querySelectorAll('.mx-tab').length);
}

/** タブの名前。1 枚のときはタブバー自体が無いので空になる。 */
async function tabNames(): Promise<string[]> {
  return browser.execute(() =>
    [...document.querySelectorAll('.mx-tab__name')].map((element) => element.textContent ?? ''),
  );
}

/** いま選ばれているタブの名前。 */
async function activeTabName(): Promise<string> {
  return browser.execute(() => document.querySelector('.mx-tab--active .mx-tab__name')?.textContent ?? '');
}

/** タイトルバーに出ているファイル名（タブが 1 枚のときの表示）。 */
async function titleName(): Promise<string> {
  return browser.execute(() => document.querySelector('.mx-titlebar__name')?.textContent ?? '');
}

describe('タブ', () => {
  before(async () => {
    writeFile(SECOND_DOC, { content: `# second\n\n2 枚目\n` });
    await openViaForward(WORK_DOC, '本文です。');
  });

  it('1 枚のときはタブバーを出さない', async () => {
    // 03.ux-spec/01-screen-layout.md §1。見た目が M2 から変わっていないことでもある。
    expect(await tabNames()).toEqual([]);
    expect(await titleName()).toBe('doc.md');
  });

  it('argv 転送は 2 枚目のタブとして開く', async () => {
    await openViaForward(SECOND_DOC, '2 枚目');

    await browser.waitUntil(async () => (await tabCount()) === 2, {
      timeout: 20_000,
      timeoutMsg: 'タブが 2 枚にならなかった',
    });
    expect(await tabNames()).toEqual(['doc.md', 'second.md']);
    expect(await activeTabName()).toBe('second.md');
  });

  it('同じファイルを転送しても増えず、そのタブへ戻る', async () => {
    await openViaForward(WORK_DOC, '本文です。');

    expect(await tabNames()).toEqual(['doc.md', 'second.md']);
    expect(await activeTabName()).toBe('doc.md');
  });

  it('Ctrl+Tab で次のタブへ移る', async () => {
    await browser.keys([Key.Control, Key.Tab]);

    await browser.waitUntil(async () => (await activeTabName()) === 'second.md', {
      timeout: 10_000,
      timeoutMsg: 'Ctrl+Tab で切り替わらなかった',
    });
  });

  it('Ctrl+1 で 1 番目のタブへ移る', async () => {
    await browser.keys([Key.Control, '1']);

    await browser.waitUntil(async () => (await activeTabName()) === 'doc.md', {
      timeout: 10_000,
      timeoutMsg: 'Ctrl+1 で切り替わらなかった',
    });
  });

  it('Ctrl+W で閉じると 1 枚に戻り、タブバーが消える', async () => {
    await browser.keys([Key.Control, 'w']);

    await browser.waitUntil(async () => (await tabCount()) === 0, {
      timeout: 10_000,
      timeoutMsg: 'Ctrl+W で閉じられなかった',
    });
    // 窓は生きている（ブラウザ既定の「ウィンドウを閉じる」を止められている）。
    expect(await titleName()).toBe('second.md');
  });

  it('Ctrl+Shift+T で閉じたタブが戻る', async () => {
    await browser.keys([Key.Control, Key.Shift, 't']);

    await browser.waitUntil(async () => (await tabCount()) === 2, {
      timeout: 20_000,
      timeoutMsg: '閉じたタブが戻らなかった',
    });
    expect(await activeTabName()).toBe('doc.md');
  });
});

/**
 * タブごとの Undo（M3 Phase 2b）。
 *
 * **エディターが 1 つのモデルを使い回していると、ここで前の文書の本文が編集面へ入る。**
 * そのまま保存すればファイル全体が別物になる（N-CMP-03）。
 * モデルはタブごとに分かれている必要があり、それを確かめられるのは本物の Monaco だけである。
 */
describe('タブごとの Undo', () => {
  it('別のタブで Undo しても、他のファイルの本文が入らない', async () => {
    // doc.md を編集する。
    await enterEditMode();
    await typeAtEnd('ZZZ');
    await browser.waitUntil(
      async () => {
        const typed = await editorText();
        return typed.includes('ZZZ');
      },
      {
        timeout: 10_000,
        timeoutMsg: '打った文字が入らなかった',
      },
    );

    // second.md のタブへ移り、そこで Undo する。並び順に依存しないよう位置を見てから押す。
    const names = await tabNames();
    await browser.keys([Key.Control, String(names.indexOf('second.md') + 1)]);
    await browser.waitUntil(async () => (await activeTabName()) === 'second.md', {
      timeout: 10_000,
      timeoutMsg: 'タブが切り替わらなかった',
    });
    await browser.keys([Key.Control, 'z']);
    await browser.pause(300);

    const text = await editorText();
    expect(text).toContain('2 枚目');
    // doc.md の本文も、そこへ打った文字も入ってこない。
    expect(text).not.toContain('本文です。');
    expect(text).not.toContain('ZZZ');
  });
});
