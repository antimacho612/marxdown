// @vitest-environment jsdom
// 値が変わるたびに `applyAppearance` が `:root` を触るので DOM が要る。
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { documentStore } from '@/features/document/store.svelte';
import {
  DEFAULT_PANES,
  DEFAULT_SETTINGS,
  getPlatform,
  NO_CUSTOM_CSS,
  setPlatform,
  type Bootstrap,
  type Platform,
} from '@/platform';

import { initSettings, refreshSettings, reportSettingsProblem, settingsStore } from './store.svelte';

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
    benchInput: false,
    trace: null,
    pendingPaths: [],
    unknownArgs: [],
    recent: [],
    zoom: 1,
    split: 0.5,
    panes: DEFAULT_PANES,
    settings: DEFAULT_SETTINGS,
    settingsError: null,
    customCss: NO_CUSTOM_CSS,
    ...settings,
  };
}

beforeEach(() => {
  settingsStore.values = DEFAULT_SETTINGS;
  documentStore.notice = null;
});

describe('設定ストア (02.architecture/04-rust-responsibilities.md §5)', () => {
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

  /**
   * 02.architecture/05-startup-sequence.md §1「テーマ / 本文幅 / フォントは描画より前」。
   *
   * `initSettings` は `bootstrap.ts` が本文を描くより前に呼ぶ。**その場で
   * 当たっている**ことをここで見張る。`$effect` で購読する形に変えると
   * 当たる瞬間がマイクロタスク以降にずれ、一度出た絵が描き変わる。
   */
  it('読み込んだ時点で見た目に当たっている（後から当てない）', () => {
    initSettings(bootstrapWith({ settings: { ...DEFAULT_SETTINGS, theme: 'dark', 'preview.maxWidth': 80 } }));

    expect(document.documentElement.dataset['theme']).toBe('dark');
    expect(document.documentElement.style.getPropertyValue('--mx-content-width')).toBe('80ch');

    initSettings(null);
  });

  /** 常駐が既定（ADR-0007）。キーと既定値はここで決まる。 */
  it('ウィンドウを閉じたときの既定はトレイ常駐', () => {
    expect(DEFAULT_SETTINGS['window.closeBehavior']).toBe('tray');
  });
});

/** 03.ux-spec/07-status-and-notifications.md §2 の 5 行目。 */
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

/** 外部エディタでの編集を即反映する（02.architecture/04-rust-responsibilities.md §5）。 */
describe('settings.json の読み直し', () => {
  function withSettings(readSettings: ReturnType<typeof vi.fn>): () => void {
    const platform = getPlatform();
    setPlatform({ ...platform, readSettings } as Platform);
    return () => setPlatform(platform);
  }

  it('読み直した値を丸ごと当て直す', async () => {
    const restore = withSettings(
      vi.fn().mockResolvedValue({ values: { ...DEFAULT_SETTINGS, theme: 'dark' }, broken: null }),
    );

    await refreshSettings();

    expect(settingsStore.values.theme).toBe('dark');
    restore();
  });

  /**
   * 02.architecture/04-rust-responsibilities.md §5 の肝。編集の途中で JSON として壊れた状態を経由するのは普通のことで、
   * そのたびにテーマが飛んでは設定を試行錯誤できない。
   */
  it('読めない内容に変わっても既定値に戻さない', async () => {
    const kept = { ...DEFAULT_SETTINGS, theme: 'dark' as const };
    const restore = withSettings(
      vi.fn().mockResolvedValue({ values: kept, broken: { path: 'C:/conf/settings.json', message: 'expected `,`' } }),
    );

    await refreshSettings();

    expect(settingsStore.values.theme).toBe('dark');
    expect(documentStore.notice?.level).toBe('error');
    restore();
  });

  it('直ったら壊れている通知を下げる', async () => {
    reportSettingsProblem({ path: 'C:/conf/settings.json', message: 'expected `,`' });
    const restore = withSettings(vi.fn().mockResolvedValue({ values: DEFAULT_SETTINGS, broken: null }));

    await refreshSettings();

    expect(documentStore.notice).toBeNull();
    restore();
  });

  it('読み直せなくても直前の値のまま動き続ける', async () => {
    settingsStore.values = { ...DEFAULT_SETTINGS, theme: 'dark' };
    const restore = withSettings(vi.fn().mockRejectedValue(new Error('IPC が落ちた')));

    await refreshSettings();

    expect(settingsStore.values.theme).toBe('dark');
    restore();
  });
});
