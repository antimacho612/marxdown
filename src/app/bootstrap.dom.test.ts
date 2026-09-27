// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { documentStore } from '@/features/document';
import type * as editor from '@/features/editor';
import { settingsStore } from '@/features/settings';
import { resetTabs, tabsStore } from '@/features/workspace';
import { t } from '@/i18n';
import { resetCommands } from '@/lib/commands';
import { resetShortcuts } from '@/lib/shortcuts';
import { DEFAULT_PANES, DEFAULT_SETTINGS, getPlatform, setPlatform, type Bootstrap, type Platform } from '@/platform';

import { startup } from './bootstrap';

/**
 * エディターのアイドルプリロードを止める（`installInitialEditor`）。
 *
 * `preloadEditor()` は Monaco（約 790KB）の動的 import であり、`requestIdle` 越しに `startup()` の解決より後で実行される。
 * テストが終わった後に読み込みが始まると、環境が破棄された後のモジュール解決になって失敗する。
 * ここで見たいのは起動の順序であって、エディターのチャンクが実際に取得できることではない。
 *
 * 他の入口（`mountEditorLazily` など）はそのままにする。差し替えるのは、このテストが呼ばない経路まで含めないためである。
 */
vi.mock('@/features/editor', async (importOriginal) => ({
  ...(await importOriginal<typeof editor>()),
  preloadEditor: () => Promise.resolve(),
}));

/** パイプラインを読み込まない。パイプラインの中身はこのテストの関心ではない。 */
vi.mock('@/markdown/parser', () => ({
  createParser: () => ({
    parse: (text: string) =>
      Promise.resolve({
        id: 1,
        chunks: [`<p>${String(text.length)}</p>`],
        blocks: [`<p>${String(text.length)}</p>`],
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
    role: 'main',
    transfer: null,
    document: null,
    documentError: null,
    mode: null,
    benchInput: false,
    trace: null,
    pendingPaths: [],
    session: [],
    sessionActive: 0,
    workspaceRoot: null,
    unknownArgs: [],
    recent: [],
    zoom: 1,
    split: 0.5,
    panes: DEFAULT_PANES,
    settings: DEFAULT_SETTINGS,
    settingsError: null,
    previewTheme: null,
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
  documentStore.statusMessage = null;
  resetTabs();
  settingsStore.values = DEFAULT_SETTINGS;
  document.documentElement.removeAttribute('style');
  delete document.documentElement.dataset['theme'];
});

afterEach(() => {
  resetShortcuts();
  resetCommands();
  setPlatform(original);
});

/** 1 枚目のドキュメント。中身は問わない。 */
function documentAt(path: string): NonNullable<Bootstrap['document']> {
  return {
    path,
    content: `# ${path}
`,
    eol: 'lf',
    bom: false,
    encoding: 'utf8',
    mtimeMs: 1,
    size: 8,
    readonly: false,
  };
}

/**
 * 2 枚目以降のタブ。
 *
 * `pendingPaths`（`marxdown a.md b.md`）と `session`（前回のタブ）の 2 経路がある。
 * どちらを使うかは Rust 側で決まり、同時には来ない。
 */
describe('2 枚目以降のタブ', () => {
  beforeEach(() => {
    setPlatform({
      ...original,
      readDocument: (path: string) => Promise.resolve({ ...documentAt(path), size: 8 }),
      pushRecent: () => Promise.resolve([]),
      watchPath: () => Promise.resolve(),
      unwatchPath: () => Promise.resolve(),
      setDirty: () => Promise.resolve(),
      setSession: () => Promise.resolve(),
    } as Platform);
  });

  it('引数の 2 枚目以降がタブとして開く', async () => {
    const bootstrap = bootstrapWith({
      document: documentAt('C:/notes/a.md'),
      pendingPaths: ['C:/notes/b.md'],
    });
    setPlatform({ ...getPlatform(), getBootstrap: () => bootstrap } as Platform);

    await startup(() => {});

    await vi.waitFor(() => {
      expect(tabsStore.tabs.map((tab) => tab.meta.path)).toEqual(['C:/notes/a.md', 'C:/notes/b.md']);
    });
  });

  it('前回のタブは並び順のまま開き直される', async () => {
    // 表示していたのは添字 1。bootstrap の `document` はそれになっている。
    const bootstrap = bootstrapWith({
      document: documentAt('C:/notes/b.md'),
      session: ['C:/notes/a.md', 'C:/notes/b.md', 'C:/notes/c.md'],
      sessionActive: 1,
    });
    setPlatform({ ...getPlatform(), getBootstrap: () => bootstrap } as Platform);

    await startup(() => {});

    // 並び順とアクティブなタブを同じ待機の中で見る。
    // 並びは最後のタブ（c.md）を挿入した時点で揃うが、その時点ではまだ c.md がアクティブであり、b.md へ戻るのは c.md を開き終えた後である。
    // 並び順だけを待ってから検査すると、c.md の読み込みが遅れた場合に中間の状態を検査してしまう。
    await vi.waitFor(() => {
      expect(tabsStore.tabs.map((tab) => tab.meta.path)).toEqual(['C:/notes/a.md', 'C:/notes/b.md', 'C:/notes/c.md']);
      expect(tabsStore.active?.meta.path).toBe('C:/notes/b.md');
    });
  });
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

    expect(documentStore.notice?.message).toBe(t.settings.broken);
  });

  it('本文を描くより前に、設定が見た目へ当たっている', async () => {
    const seen: (string | undefined)[] = [];
    stubPlatform(
      bootstrapWith({
        settings: { ...DEFAULT_SETTINGS, theme: 'dark', 'preview.maxWidth': 80 },
      }),
    );

    // シェルの描画は本文より前に実行される。その時点で既に適用されていることを見る。
    await startup(() => {
      seen.push(document.documentElement.dataset['theme']);
      seen.push(document.documentElement.style.getPropertyValue('--mx-content-width'));
    });

    expect(seen).toEqual(['dark', '80ch']);
  });

  /**
   * ADR-0014。`themes/` から選ばれている 1 枚は bootstrap に同梱されて届き、カタログを待たずに当たる。
   * 待つ形にすると、暗い配色を選んでいる人の初回フレームが既定の配色で描かれる。
   */
  it('本文を描くより前に、bootstrap の配色が当たっている', async () => {
    const seen: string[] = [];
    stubPlatform(
      bootstrapWith({
        settings: { ...DEFAULT_SETTINGS, 'preview.theme': 'mine' },
        previewTheme: { id: 'mine', declarations: '--mx-color-bg: #101010;' },
      }),
    );

    await startup(() => {
      seen.push(document.querySelector<HTMLStyleElement>('style#mx-preview-theme')?.textContent ?? '');
    });

    expect(seen[0]).toContain("[data-mx-theme='mine']");
    expect(seen[0]).toContain('--mx-color-bg: #101010;');
  });
});
