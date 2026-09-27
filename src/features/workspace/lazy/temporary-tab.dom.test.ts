// @vitest-environment jsdom
import { flushSync } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { configureOpener, documentStore, openPath, setDirty } from '@/features/document';
import type { MarkdownParser } from '@/markdown/parser';
import { getPlatform, setPlatform, type DocumentPayload, type Platform, type RecentEntry } from '@/platform';

import { workspaceOpenerHooks } from '../opened';
import {
  activateTab,
  closeTab,
  openPathInNewTab,
  reopenClosedTab,
  resetTabs,
  tabMeta,
  tabsStore,
} from '../tabs.svelte';
import { keepTab, keepTabOf, openPathInTemporaryTab } from './temporary-tab.svelte';

const original = getPlatform();

/** 「破棄しますか」の返事。既定は破棄で、呼ばれた回数も数える。 */
let confirmDiscard: ReturnType<typeof vi.fn>;

/** ディスクの中身。テストの途中で書き換えて外部変更を作る。 */
const disk = new Map<string, string>();

function payload(path: string): DocumentPayload {
  const content = disk.get(path) ?? `# ${path}\n`;
  return { path, content, eol: 'lf', bom: false, encoding: 'utf8', mtimeMs: 1, size: content.length, readonly: false };
}

function fakeParser(): MarkdownParser {
  return {
    parse: (text) =>
      Promise.resolve({
        id: 1,
        chunks: [`<p>${text.length}</p>`],
        blocks: [`<p>${text.length}</p>`],
        outline: [],
        frontMatter: null,
        parseMs: 0.1,
        textStats: { chars: text.length, words: 1, readingMinutes: 1 },
      }),
    dispose: () => {},
  };
}

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
  vi.stubGlobal('requestIdleCallback', undefined);
  document.body.innerHTML = '<div id="mx-preview"></div>';

  confirmDiscard = vi.fn(() => Promise.resolve('discard' as const));

  disk.clear();
  disk.set('C:/work/a.md', '# a\n');
  disk.set('C:/work/b.md', '# b\n');
  disk.set('C:/work/c.md', '# c\n');

  setPlatform({
    ...original,
    readDocument: (path: string) =>
      disk.has(path) ? Promise.resolve(payload(path)) : Promise.reject({ kind: 'not-found', message: path }),
    pushRecent: (path: string) => Promise.resolve([{ path, openedAtMs: 1 }] as RecentEntry[]),
    removeRecent: () => Promise.resolve([] as RecentEntry[]),
    watchPath: () => Promise.resolve(),
    unwatchPath: () => Promise.resolve(),
    setDirty: () => Promise.resolve(),
    confirmDiscard: confirmDiscard,
  } as Platform);

  documentStore.meta = null;
  documentStore.eolOverride = null;
  setDirty(false);
  resetTabs();
  configureOpener({ parser: fakeParser(), softBreak: () => false, syntax: () => [], ...workspaceOpenerHooks() });
});

afterEach(() => {
  setPlatform(original);
  vi.unstubAllGlobals();
});

/** 並びを「パス（仮タブなら `*` を付ける）」で表す。 */
function strip(): string[] {
  return tabsStore.tabs.map((tab) => `${tabMeta(tab).path ?? ''}${tab.temporary ? '*' : ''}`);
}

describe('仮タブ (ADR-0024)', () => {
  it('次の仮タブで同じ位置が置き換わる', async () => {
    await openPath('C:/work/a.md');
    await openPathInTemporaryTab('C:/work/b.md');
    expect(strip()).toEqual(['C:/work/a.md', 'C:/work/b.md*']);

    await activateTab(tabsStore.tabs[0]?.id ?? 0);
    await openPathInTemporaryTab('C:/work/c.md');
    expect(strip()).toEqual(['C:/work/a.md', 'C:/work/c.md*']);
    expect(documentStore.meta?.path).toBe('C:/work/c.md');
  });

  it('置き換えた仮タブは「閉じたタブを再度開く」に載らない', async () => {
    await openPathInTemporaryTab('C:/work/a.md');
    await openPathInTemporaryTab('C:/work/b.md');
    expect(await reopenClosedTab()).toBe(false);
  });

  it('既に開いているファイルは、切り替えるだけで仮タブにしない', async () => {
    await openPath('C:/work/a.md');
    await openPathInNewTab('C:/work/b.md');
    await openPathInTemporaryTab('C:/work/a.md');
    expect(strip()).toEqual(['C:/work/a.md', 'C:/work/b.md']);
    expect(tabsStore.active?.meta.path).toBe('C:/work/a.md');
  });

  it('続けてクリックしても、仮タブは 1 枚に保たれる', async () => {
    await openPath('C:/work/a.md');
    await Promise.all([openPathInTemporaryTab('C:/work/b.md'), openPathInTemporaryTab('C:/work/c.md')]);
    expect(tabsStore.tabs.filter((tab) => tab.temporary)).toHaveLength(1);
  });

  it('保持すると通常のタブになり、次の仮タブは別に開く', async () => {
    await openPathInTemporaryTab('C:/work/a.md');
    keepTab(tabsStore.activeId ?? 0);
    await openPathInTemporaryTab('C:/work/b.md');
    expect(strip()).toEqual(['C:/work/a.md', 'C:/work/b.md*']);
  });

  it('ファイルツリーのダブルクリックは、開き終わるのを待ってから固定する', async () => {
    const opening = openPathInTemporaryTab('C:/work/a.md');
    await keepTabOf('C:/work/a.md');
    await opening;
    expect(strip()).toEqual(['C:/work/a.md']);
  });

  it('編集すると通常のタブになる', async () => {
    await openPathInTemporaryTab('C:/work/a.md');
    setDirty(true);
    flushSync();
    expect(strip()).toEqual(['C:/work/a.md']);
  });

  it('ダーティなタブから仮タブへ切り替えても、仮タブは固定されない', async () => {
    await openPath('C:/work/a.md');
    setDirty(true);
    await openPathInTemporaryTab('C:/work/b.md');
    flushSync();
    expect(strip()).toEqual(['C:/work/a.md', 'C:/work/b.md*']);
  });

  it('仮タブを閉じると、次は末尾に開く', async () => {
    await openPath('C:/work/a.md');
    await openPathInTemporaryTab('C:/work/b.md');
    await closeTab(tabsStore.activeId ?? 0);
    await openPathInTemporaryTab('C:/work/c.md');
    expect(strip()).toEqual(['C:/work/a.md', 'C:/work/c.md*']);
  });
});
