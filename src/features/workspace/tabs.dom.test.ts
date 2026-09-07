// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { configureOpener, documentStore, openPath, setDirty } from '@/features/document';
import type { MarkdownParser } from '@/markdown/parser';
import { getPlatform, setPlatform, type DocumentPayload, type Platform, type RecentEntry } from '@/platform';

import { workspaceOpenerHooks } from './opened';
import { activateTab, closeTab, isTabDirty, openInNewTab, resetTabs, tabsStore, type Tab } from './tabs.svelte';

const original = getPlatform();

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

  disk.clear();
  disk.set('C:/work/a.md', '# a\n');
  disk.set('C:/work/b.md', '# b\n');

  setPlatform({
    ...original,
    readDocument: (path: string) => Promise.resolve(payload(path)),
    pushRecent: (path: string) => Promise.resolve([{ path, openedAtMs: 1 }] as RecentEntry[]),
    removeRecent: () => Promise.resolve([] as RecentEntry[]),
    watchPath: () => Promise.resolve(),
    setDirty: () => Promise.resolve(),
  } as Platform);

  documentStore.meta = null;
  documentStore.eolOverride = null;
  setDirty(false);
  resetTabs();
  configureOpener({ parser: fakeParser(), ...workspaceOpenerHooks() });
});

afterEach(() => {
  setPlatform(original);
  vi.unstubAllGlobals();
});

/** ルーンの `$state` フィールドを列挙する。`store.test.ts` と同じ見張り方。 */
function tabKeys(tab: Tab): string[] {
  return Object.getOwnPropertyNames(tab);
}

describe('タブ 1 枚のとき', () => {
  it('開くと 1 枚だけ作られ、以降は開き直しても増えない', async () => {
    await openPath('C:/work/a.md');
    expect(tabsStore.tabs).toHaveLength(1);
    expect(tabsStore.active?.meta.path).toBe('C:/work/a.md');

    await openPath('C:/work/b.md');
    expect(tabsStore.tabs).toHaveLength(1);
    expect(tabsStore.active?.meta.path).toBe('C:/work/b.md');
  });

  it('最後の 1 枚は閉じない', async () => {
    await openPath('C:/work/a.md');
    const id = tabsStore.activeId ?? 0;

    expect(await closeTab(id)).toBe(false);
    expect(tabsStore.tabs).toHaveLength(1);
  });
});

describe('本文の持ち方', () => {
  it('アクティブなタブは本文を持たない (ADR-0005)', async () => {
    await openPath('C:/work/a.md');
    const active = tabsStore.active;

    // ここに本文が生えたら、1 打鍵ごとに巨大な文字列がリアクティビティを通過する。
    expect(active?.text).toBeNull();
    expect(tabKeys(active as Tab).toSorted()).toEqual(['eolOverride', 'id', 'meta', 'scrollTop', 'text', 'textDirty']);
    expect(active?.meta).not.toHaveProperty('content');
  });

  it('ディスクと一致しているタブは、切り替えても本文を抱えない', async () => {
    await openPath('C:/work/a.md');
    const first = tabsStore.activeId ?? 0;
    await openInNewTab(payload('C:/work/b.md'));

    expect(tabsStore.tabs.find((tab) => tab.id === first)?.text).toBeNull();
  });

  it('未保存の変更があるタブは本文を抱える', async () => {
    await openPath('C:/work/a.md');
    const first = tabsStore.activeId ?? 0;
    setDirty(true);

    await openInNewTab(payload('C:/work/b.md'));

    expect(tabsStore.tabs.find((tab) => tab.id === first)?.text).toBe('# a\n');
  });
});

describe('切り替え', () => {
  it('未保存の本文とダーティ状態を保ったまま戻れる', async () => {
    await openPath('C:/work/a.md');
    const first = tabsStore.activeId ?? 0;
    setDirty(true);

    await openInNewTab(payload('C:/work/b.md'));
    expect(documentStore.isDirty).toBe(false);

    expect(await activateTab(first)).toBe(true);
    expect(documentStore.meta?.path).toBe('C:/work/a.md');
    expect(documentStore.isDirty).toBe(true);
    // 戻したぶんは表示側が真実になるので、タブは抱え続けない
    expect(tabsStore.active?.text).toBeNull();
  });

  it('EOL の変換だけを指定したタブは、本文側のダーティを立てずに戻る', async () => {
    await openPath('C:/work/a.md');
    const first = tabsStore.activeId ?? 0;
    documentStore.eolOverride = 'crlf';

    await openInNewTab(payload('C:/work/b.md'));
    await activateTab(first);

    expect(documentStore.eolOverride).toBe('crlf');
    expect(isTabDirty(tabsStore.active as Tab)).toBe(true);
    // 本文は触っていない。合成して立てると、EOL を戻してもダーティが残る
    expect(tabsStore.active?.textDirty).toBe(false);
  });

  it('ディスクと一致しているタブは読み直す（背後の外部変更を拾う）', async () => {
    await openPath('C:/work/a.md');
    const first = tabsStore.activeId ?? 0;
    await openInNewTab(payload('C:/work/b.md'));

    disk.set('C:/work/a.md', '# a changed\n');
    await activateTab(first);

    expect(documentStore.meta?.size).toBe('# a changed\n'.length);
  });

  it('切り替え元のタブを上書きしない', async () => {
    await openPath('C:/work/a.md');
    const first = tabsStore.activeId ?? 0;
    await openInNewTab(payload('C:/work/b.md'));

    await activateTab(first);

    expect(tabsStore.tabs.map((tab) => tab.meta.path)).toEqual(['C:/work/a.md', 'C:/work/b.md']);
  });

  it('スクロール位置を覚えている', async () => {
    await openPath('C:/work/a.md');
    const first = tabsStore.activeId ?? 0;
    const preview = document.querySelector<HTMLElement>('#mx-preview');
    // jsdom は要素に高さを持たないため、代入できる形にして位置だけを見る
    Object.defineProperty(preview, 'scrollTop', { value: 120, writable: true });

    await openInNewTab(payload('C:/work/b.md'));

    expect(tabsStore.tabs.find((tab) => tab.id === first)?.scrollTop).toBe(120);
  });
});

describe('閉じる', () => {
  it('表示中のタブを閉じると隣が表示される', async () => {
    await openPath('C:/work/a.md');
    const first = tabsStore.activeId ?? 0;
    await openInNewTab(payload('C:/work/b.md'));
    const second = tabsStore.activeId ?? 0;

    expect(await closeTab(second)).toBe(true);
    expect(tabsStore.tabs).toHaveLength(1);
    expect(tabsStore.activeId).toBe(first);
    expect(documentStore.meta?.path).toBe('C:/work/a.md');
  });

  it('表示していないタブを閉じても、表示中の文書は変わらない', async () => {
    await openPath('C:/work/a.md');
    const first = tabsStore.activeId ?? 0;
    await openInNewTab(payload('C:/work/b.md'));

    expect(await closeTab(first)).toBe(true);
    expect(documentStore.meta?.path).toBe('C:/work/b.md');
  });
});
