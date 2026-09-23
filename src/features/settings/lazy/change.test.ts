// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { documentStore } from '@/features/document';
import { DEFAULT_SETTINGS, getPlatform, setPlatform, type Platform, type Settings } from '@/platform';

import { settingsStore } from '../store.svelte';
import { changeSetting, flushSettingWrites } from './change';

const original = getPlatform();

/** 書き戻しを差し替える。返す値は Rust 側と同じく「既定値で埋めた後の全体」。 */
function stubWrite(impl: (patch: Record<string, unknown>) => Promise<Settings>) {
  const writeSettings = vi.fn(impl);
  setPlatform({ ...original, writeSettings } as Platform);
  return writeSettings;
}

beforeEach(() => {
  settingsStore.values = DEFAULT_SETTINGS;
  documentStore.notice = null;
  document.documentElement.removeAttribute('style');
  delete document.documentElement.dataset['theme'];
});

afterEach(async () => {
  // デバウンス中の書き込みを次のテストへ持ち越さない。
  await flushSettingWrites();
  setPlatform(original);
});

describe('設定の変更 (F-CONF-05)', () => {
  /** 設定を試行錯誤しながら使えること自体が目的なので、適用は即座に行い、保存は遅らせる。 */
  it('見た目は書き戻しを待たずに変わる', () => {
    stubWrite(async () => DEFAULT_SETTINGS);

    changeSetting('preview.maxWidth', 80);

    expect(document.documentElement.style.getPropertyValue('--mx-content-width')).toBe('80ch');
    expect(settingsStore.values['preview.maxWidth']).toBe(80);
  });

  /** `zoom.ts` と同じ理由。1 文字打つたびに `settings.json` を書かない。 */
  it('連続した変更は 1 回の書き込みにまとまる', async () => {
    const write = stubWrite(async () => ({ ...DEFAULT_SETTINGS, 'preview.fontFamily': 'Meiryo' }));

    changeSetting('preview.fontFamily', 'M');
    changeSetting('preview.fontFamily', 'Me');
    changeSetting('preview.fontFamily', 'Meiryo');
    await flushSettingWrites();

    expect(write).toHaveBeenCalledOnce();
    expect(write).toHaveBeenCalledWith({ 'preview.fontFamily': 'Meiryo' });
  });

  /**
   * 02.architecture/04-rust-responsibilities.md §5。既定値を書き込むのではなく、キーごと消す。
   * こうしておくと、既定値が変わったときに設定ファイルが追従する。
   */
  it('既定に戻すと、キーを消す patch を送る', async () => {
    const write = stubWrite(async () => DEFAULT_SETTINGS);
    settingsStore.values = { ...DEFAULT_SETTINGS, 'preview.fontSize': 22 };

    changeSetting('preview.fontSize', null);
    await flushSettingWrites();

    expect(write).toHaveBeenCalledWith({ 'preview.fontSize': null });
    expect(settingsStore.values['preview.fontSize']).toBe(DEFAULT_SETTINGS['preview.fontSize']);
    expect(document.documentElement.style.getPropertyValue('--mx-font-size-content')).toBe('');
  });

  /** 「既定に戻す」ボタンと、既定値を選び直すことが、ファイルの上で同じになる。 */
  it('既定値と同じ値を選び直しても、キーを消す', async () => {
    const write = stubWrite(async () => DEFAULT_SETTINGS);
    settingsStore.values = { ...DEFAULT_SETTINGS, theme: 'dark' };

    changeSetting('theme', 'system');
    await flushSettingWrites();

    expect(write).toHaveBeenCalledWith({ theme: null });
  });

  it('範囲外の数値は、当てる前に潰す', () => {
    stubWrite(async () => DEFAULT_SETTINGS);

    changeSetting('preview.lineHeight', 99);

    expect(settingsStore.values['preview.lineHeight']).toBe(3);
  });

  /**
   * 02.architecture/04-rust-responsibilities.md §5 の 3 番目。
   * UI は壊れているときに呼ばない前提だが、呼ばれてしまった場合に通知なしで失敗しないことをここで担保する。
   */
  it('書き込みに失敗したら通知バーに出す', async () => {
    stubWrite(() => Promise.reject({ kind: 'settings-broken', message: 'broken' }));

    changeSetting('theme', 'dark');
    await flushSettingWrites();

    expect(documentStore.notice?.level).toBe('error');
    expect(documentStore.notice?.message).toBe('settings.json を読めないため、設定を保存できません');
  });
});
