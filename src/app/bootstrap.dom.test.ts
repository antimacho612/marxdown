// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { documentStore } from '@/features/document/store.svelte';
import { settingsStore } from '@/features/settings/store.svelte';
import { ja } from '@/i18n/ja';
import { DEFAULT_SETTINGS, getPlatform, setPlatform, type Bootstrap, type Platform } from '@/platform';

import { startup } from './bootstrap';
import { resetShortcuts } from './shortcuts';

/** Worker を立てない。パイプラインの中身はこのテストの関心ではない。 */
vi.mock('@/markdown/worker/client', () => ({
  createParser: () => ({
    parse: (text: string) =>
      Promise.resolve({
        type: 'parsed' as const,
        id: 1,
        chunks: [`<p>${String(text.length)}</p>`],
        outline: [],
        frontMatter: null,
        parseMs: 0.1,
        textStats: { chars: text.length, words: 1, readingMinutes: 1 },
      }),
    dispose: () => {},
  }),
}));

const original = getPlatform();

const BROKEN = { path: 'C:\\conf\\settings.json', message: 'expected `,`' };

function bootstrapWith(patch: Partial<Bootstrap>): Bootstrap {
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
    ...patch,
  };
}

function stubPlatform(bootstrap: Bootstrap): void {
  setPlatform({ ...original, getBootstrap: () => bootstrap } as Platform);
}

beforeEach(() => {
  document.body.replaceChildren();
  const preview = document.createElement('div');
  preview.id = 'mx-preview';
  document.body.append(preview);
  documentStore.notice = null;
  settingsStore.values = DEFAULT_SETTINGS;
  document.documentElement.removeAttribute('style');
  delete document.documentElement.dataset['theme'];
});

afterEach(() => {
  resetShortcuts();
  setPlatform(original);
});

describe('起動シーケンス (02.architecture.md §5.1)', () => {
  /**
   * 03.ux-spec.md §8.2 の 5 行目は「消えない」通知である。
   *
   * **`openDocument` は描画に成功した時点で通知バーを下げる**（開けなかったことを
   * 知らせる通知を、開けたあとも残さないため）。起動時の通知をその手前で出すと、
   * ファイルを指定して起動したときだけ、壊れた `settings.json` が黙って無視される。
   */
  it('本文を開いても、settings.json が壊れている通知は残る', async () => {
    stubPlatform(
      bootstrapWith({
        document: {
          path: 'C:\\notes\\a.md',
          content: '# hello\n',
          eol: 'lf',
          bom: false,
          encoding: 'utf8',
          mtimeMs: 1,
          size: 8,
          readonly: false,
        },
        settingsError: BROKEN,
      }),
    );

    await startup(() => {});

    expect(documentStore.notice?.message).toBe(ja.settings.broken);
  });

  /**
   * 02.architecture.md §5.1「テーマ / 本文幅 / フォントは**描画より前**」。
   * 後から当てると FOUC になる（一度出た絵が描き変わる）。
   */
  it('本文を描くより前に、設定が見た目へ当たっている', async () => {
    const seen: (string | undefined)[] = [];
    stubPlatform(
      bootstrapWith({
        settings: { ...DEFAULT_SETTINGS, theme: 'dark', 'preview.maxWidth': 80 },
      }),
    );

    // シェルの描画は本文より前に走る。その時点で既に当たっていることを見る。
    await startup(() => {
      seen.push(document.documentElement.dataset['theme']);
      seen.push(document.documentElement.style.getPropertyValue('--mx-content-width'));
    });

    expect(seen).toEqual(['dark', '80ch']);
  });
});
