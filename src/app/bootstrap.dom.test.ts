// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { documentStore } from '@/features/document/store.svelte';
import { settingsStore } from '@/features/settings/store.svelte';
import { ja } from '@/i18n/ja';
import { resetCommands } from '@/lib/commands';
import { resetShortcuts } from '@/lib/shortcuts';
import {
  DEFAULT_PANES,
  DEFAULT_SETTINGS,
  getPlatform,
  NO_CUSTOM_CSS,
  setPlatform,
  type Bootstrap,
  type Platform,
} from '@/platform';

import { startup } from './bootstrap';

/** Worker を立てない。パイプラインの中身はこのテストの関心ではない。 */
vi.mock('@/markdown/parser', () => ({
  createParser: () => ({
    parse: (text: string) =>
      Promise.resolve({
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
    editorCss: NO_CUSTOM_CSS,
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
  resetCommands();
  setPlatform(original);
});

describe('startup', () => {
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

  it('本文を描くより前に、bootstrap のカスタム CSS が当たっている', async () => {
    const seen: string[] = [];
    stubPlatform(bootstrapWith({ customCss: { ...NO_CUSTOM_CSS, css: 'h1 { color: red }' } }));

    await startup(() => {
      seen.push(document.querySelector<HTMLStyleElement>('style#mx-custom-css')?.textContent ?? '');
    });

    expect(seen[0]).toContain('@scope (#mx-preview)');
    expect(seen[0]).toContain('color: red');
  });
});
