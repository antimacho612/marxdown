// @vitest-environment jsdom
/**
 * 前回のタブの記録と復元（OQ-04 / M3 Phase 7）。
 *
 * 見たいのは 2 つ。**並び順が戻ること**と、**覚えないものを覚えないこと**である。
 * 引数があるときに復元しないという判断は Rust 側にあり（`bootstrap.rs`）、ここには届かない。
 */
import { flushSync } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { configureOpener, documentStore, openPath, setDirty } from '@/features/document';
import type { MarkdownParser } from '@/markdown/parser';
import { getPlatform, setPlatform, type DocumentPayload, type Platform, type RecentEntry } from '@/platform';

import { workspaceOpenerHooks } from './opened';
import { resetSessionWatch, restoreSession, watchSession } from './session.svelte';
import { openUntitledTab, resetTabs, tabsStore } from './tabs.svelte';

const original = getPlatform();

let setSession: ReturnType<typeof vi.fn>;
let pushRecent: ReturnType<typeof vi.fn>;
let stopWatch: (() => void) | null = null;

function payload(path: string): DocumentPayload {
  const content = `# ${path}\n`;
  return { path, content, eol: 'lf', bom: false, encoding: 'utf8', mtimeMs: 1, size: content.length, readonly: false };
}

function fakeParser(): MarkdownParser {
  return {
    parse: (text) =>
      Promise.resolve({
        id: 1,
        chunks: [`<p>${text.length}</p>`],
        outline: [],
        frontMatter: null,
        parseMs: 0.1,
        textStats: { chars: text.length, words: 1, readingMinutes: 1 },
      }),
    dispose: () => {},
  };
}

/** いま開いているタブのパス。並び順のまま。 */
function tabPaths(): (string | null)[] {
  return tabsStore.tabs.map((tab) => tab.meta.path);
}

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
  vi.stubGlobal('requestIdleCallback', undefined);
  document.body.innerHTML = '<div id="mx-preview"></div>';

  setSession = vi.fn(() => Promise.resolve());
  pushRecent = vi.fn((path: string) => Promise.resolve([{ path, openedAtMs: 1 }] as RecentEntry[]));

  setPlatform({
    ...original,
    readDocument: (path: string) => Promise.resolve(payload(path)),
    pushRecent,
    removeRecent: () => Promise.resolve([] as RecentEntry[]),
    watchPath: () => Promise.resolve(),
    unwatchPath: () => Promise.resolve(),
    setDirty: () => Promise.resolve(),
    setSession,
  } as Platform);

  documentStore.meta = null;
  setDirty(false);
  resetTabs();
  resetSessionWatch();
  configureOpener({ parser: fakeParser(), softBreak: () => false, ...workspaceOpenerHooks() });
});

afterEach(() => {
  stopWatch?.();
  stopWatch = null;
  setPlatform(original);
  vi.unstubAllGlobals();
});

describe('復元', () => {
  it('表示していたタブ以外を元の位置へ開き直す', async () => {
    // bootstrap は表示していた 1 枚（添字 1）だけを開いた状態で届く。
    await openPath('C:/work/b.md');

    await restoreSession(['C:/work/a.md', 'C:/work/b.md', 'C:/work/c.md'], 1);

    expect(tabPaths()).toEqual(['C:/work/a.md', 'C:/work/b.md', 'C:/work/c.md']);
    expect(tabsStore.active?.meta.path).toBe('C:/work/b.md');
  });

  it('最近開いたファイルには積み直さない', async () => {
    await openPath('C:/work/b.md');
    pushRecent.mockClear();

    await restoreSession(['C:/work/a.md', 'C:/work/b.md'], 1);

    // 起動しただけで一覧が前回のタブで埋まると、「最後に開いた順」の意味が失われる。
    expect(pushRecent).not.toHaveBeenCalled();
  });
});

describe('記録', () => {
  it('タブが増えると、並び順と表示中の位置を書く', async () => {
    stopWatch = watchSession();
    await openPath('C:/work/a.md');
    await restoreSession(['C:/work/a.md', 'C:/work/b.md'], 0);
    flushSync();

    expect(setSession).toHaveBeenLastCalledWith(['C:/work/a.md', 'C:/work/b.md'], 0);
  });

  it('パスを持たないタブは覚えない', async () => {
    stopWatch = watchSession();
    await openPath('C:/work/a.md');
    flushSync();
    setSession.mockClear();

    openUntitledTab();
    flushSync();

    // タブは増えている。
    expect(tabsStore.tabs).toHaveLength(2);
    // それでも記録は変わらない。新規ファイルは開き直せないので、載せても復元できない 1 枚が増えるだけである。
    expect(setSession).not.toHaveBeenCalled();
  });

  it('同じ状態を二度書かない', async () => {
    stopWatch = watchSession();
    await openPath('C:/work/a.md');
    flushSync();
    const calls = setSession.mock.calls.length;

    flushSync();
    expect(setSession.mock.calls).toHaveLength(calls);
  });
});
