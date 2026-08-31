/**
 * 表示モードの切り替え（F-MODE-06 / M2 Phase 1）。
 *
 * **ここでしか確かめられないのは「遅延チャンクが本物のビルドで載る」こと。**
 * Vitest では `features/editor/open-editor` をモックしており、`editor` チャンク
 * が実際に取得・評価されるかは見ていない。分割の境界を壊すと
 * 起動が太るか、切り替えたときに何も出ないかのどちらかになる。
 *
 * **Monaco になってから、ここは重くなった。** 792KB（raw 3.0MB）の取得と評価が
 * 切り替えの瞬間に入るので、待ち時間の上限を広げてある（`waitForEditorMounted`）。
 * この 1 本が落ちるということは、idle プリロードが効いていないということでもある
 * （[ADR-0009](../../docs/adr/0009-editor-engine-monaco.md) の根拠 2）。
 */
import { Key } from 'webdriverio';

import { editorContentText, mountedEditorCount, openViaForward, waitForEditorMounted } from '../helpers/app';
import { WORK_DOC } from '../helpers/fixtures';

/** `bindKeys` は `globalThis` の keydown を見る（`src/lib/shortcuts.ts`）。 */
async function pressTogglePreview(): Promise<void> {
  await browser.keys([Key.Control, Key.Shift, 'v']);
}

async function mode(): Promise<string> {
  return browser.execute(() => document.documentElement.dataset['mxMode'] ?? '');
}

describe('Preview と Edit を行き来する', () => {
  before(async () => {
    await openViaForward(WORK_DOC, '本文です。');
  });

  it('起動直後は Preview で、エディタは載っていない', async () => {
    // 既定が Preview であることが `editor` チャンクを分ける境界そのもの
    // （02.architecture/05-startup-sequence.md §1 の要点 3）。
    expect(await mode()).toBe('preview');
    expect(await mountedEditorCount()).toBe(0);
  });

  it('Ctrl+Shift+V で Edit に入り、エディタが載る', async () => {
    await pressTogglePreview();

    await browser.waitUntil(async () => (await mode()) === 'edit', {
      timeout: 20_000,
      timeoutMsg: 'Edit へ切り替わらなかった',
    });

    // 遅延チャンクの取得と評価を待つ。ここが失敗するなら分割が壊れている。
    await waitForEditorMounted();
  });

  it('エディタに読み込んだ本文が入っている', async () => {
    const text = await editorContentText();
    expect(text).toContain('本文です。');
  });

  it('ステータスバーの表示が Edit になる', async () => {
    await expect($('.mx-statusbar')).toHaveText(expect.stringContaining('Edit'));
  });

  it('もう一度押すと Preview に戻り、エディタは壊されない', async () => {
    // 03.ux-spec/02-view-modes.md §4。破棄すると Undo 履歴が消える。
    await pressTogglePreview();

    await browser.waitUntil(async () => (await mode()) === 'preview', {
      timeout: 20_000,
      timeoutMsg: 'Preview へ戻らなかった',
    });

    expect(await mountedEditorCount()).toBe(1);
  });
});
