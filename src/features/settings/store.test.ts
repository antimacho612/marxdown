import { beforeEach, describe, expect, it, vi } from 'vitest';

import { documentStore } from '@/features/document/store.svelte';
import { DEFAULT_SETTINGS, getPlatform, setPlatform, type Bootstrap, type Platform } from '@/platform';

import { initSettings, reportSettingsProblem, settingsStore } from './store.svelte';

/**
 * `src/features/document/store.test.ts` と同じ見張り。
 *
 * ルーンで宣言したフィールドはインスタンスの own プロパティに、手書きのアクセサは
 * プロトタイプに乗る。**置き場所が 2 つに分かれる**ので両方を見る必要がある。
 */
function stateKeys(): string[] {
  const proto: object = Object.getPrototypeOf(settingsStore);
  const inherited = Object.entries(Object.getOwnPropertyDescriptors(proto))
    .filter(([k, d]) => k !== 'constructor' && typeof d.get === 'function')
    .map(([k]) => k);
  return [...Object.getOwnPropertyNames(settingsStore), ...inherited];
}

function bootstrapWith(settings: Partial<Bootstrap>): Bootstrap {
  return {
    version: 1,
    document: null,
    documentError: null,
    mode: null,
    spike: { parse: 'worker' },
    trace: null,
    pendingPaths: [],
    unknownArgs: [],
    recent: [],
    zoom: 1,
    settings: DEFAULT_SETTINGS,
    settingsError: null,
    ...settings,
  };
}

beforeEach(() => {
  settingsStore.values = DEFAULT_SETTINGS;
  documentStore.notice = null;
});

describe('設定ストア (02.architecture.md §4.5)', () => {
  it('設定の値だけを持つ', () => {
    // ここに「壊れているか」や本文が生えたら設計違反。
    // 壊れている事実は通知バーに流して終わりにする（2 か所に持たない）。
    expect(stateKeys()).toEqual(['values']);
  });

  it('bootstrap から同期的に初期化する（IPC 往復を作らない）', () => {
    const platform = getPlatform();
    const readSettings = vi.fn();
    setPlatform({ ...platform, readSettings } as Platform);

    initSettings(bootstrapWith({ settings: { ...DEFAULT_SETTINGS, theme: 'dark', 'preview.maxWidth': 80 } }));

    expect(settingsStore.values.theme).toBe('dark');
    expect(settingsStore.values['preview.maxWidth']).toBe(80);
    expect(readSettings).not.toHaveBeenCalled();
    setPlatform(platform);
  });

  it('bootstrap が無くても既定値で動く', () => {
    initSettings(null);
    expect(settingsStore.values).toEqual(DEFAULT_SETTINGS);
  });

  /** §4.5「常駐が既定」。実際に効くのは Phase 7 だが、キーと既定値はここで決まる。 */
  it('ウィンドウを閉じたときの既定はトレイ常駐', () => {
    expect(DEFAULT_SETTINGS['window.closeBehavior']).toBe('tray');
  });
});

/** 03.ux-spec.md §8.2 の 5 行目。 */
describe('壊れた settings.json の通知', () => {
  it('消えないエラー通知と「ファイルを開く」を出す', () => {
    reportSettingsProblem({ path: 'C:/conf/settings.json', message: 'expected `,`' });

    const notice = documentStore.notice;
    expect(notice?.level).toBe('error');
    expect(notice?.autoDismissMs).toBeUndefined();
    expect(notice?.actions?.map((a) => a.label)).toEqual(['ファイルを開く']);
  });

  it('「ファイルを開く」で設定ファイルを開く', () => {
    const platform = getPlatform();
    const openSettingsFile = vi.fn().mockResolvedValue(undefined);
    setPlatform({ ...platform, openSettingsFile } as Platform);

    reportSettingsProblem({ path: 'C:/conf/settings.json', message: 'expected `,`' });
    documentStore.notice?.actions?.[0]?.run();

    expect(openSettingsFile).toHaveBeenCalledOnce();
    setPlatform(platform);
  });

  it('壊れていなければ何も出さない', () => {
    reportSettingsProblem(null);
    expect(documentStore.notice).toBeNull();
  });
});
