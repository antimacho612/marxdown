/**
 * セッション復元（F-NAV-01）。
 *
 * ここでしか確かめられないのは、引数なしの起動が前回のタブを開き直すことである。
 * Vitest 側はプラットフォームをモックしており、`state.json` も CLI 引数も通っていない。
 *
 * 前回のタブは `beforeSession` が用意する（`helpers/session.ts`）。
 * アプリはセッションを張った時点で立ち上がっているため、spec の中では間に合わない。
 */
import { Key } from 'webdriverio';

import { RESTORED_ACTIVE, RESTORED_FIRST, RESTORED_SECOND } from '../helpers/session';
import { readSession } from '../helpers/store';

/** タブの名前。 */
async function tabNames(): Promise<string[]> {
  return browser.execute(() =>
    [...document.querySelectorAll('.mx-tab__name')].map((element) => element.textContent ?? ''),
  );
}

/** いま選ばれているタブの名前。 */
async function activeTabName(): Promise<string> {
  return browser.execute(() => document.querySelector('.mx-tab--active .mx-tab__name')?.textContent ?? '');
}

describe('前回のタブ', () => {
  it('引数なしで起動すると、並び順のまま開き直される', async () => {
    await browser.waitUntil(
      async () => {
        const names = await tabNames();
        return names.length === 2;
      },
      { timeout: 30_000, timeoutMsg: '前回のタブが復元されなかった' },
    );

    expect(await tabNames()).toEqual(['restored-a.md', 'restored-b.md']);
  });

  it('表示していたタブが選ばれている', async () => {
    // 先頭ではない位置を用意してある。並びと選択が別々に復元されることの確認。
    expect(RESTORED_ACTIVE).toBe(1);
    expect(await activeTabName()).toBe('restored-b.md');
  });

  it('タブを操作すると記録が追いつく', async () => {
    // 1 枚目へ切り替えると、表示中の位置が書き戻される。
    await browser.keys([Key.Control, '1']);

    await browser.waitUntil(() => Promise.resolve(readSession().active === 0), {
      timeout: 20_000,
      timeoutMsg: 'state.json の記録が追いつかなかった',
    });

    const session = readSession();
    expect(session.paths).toEqual([RESTORED_FIRST, RESTORED_SECOND]);
  });
});
