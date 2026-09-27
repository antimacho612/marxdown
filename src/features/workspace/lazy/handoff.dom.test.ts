// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { configureOpener, documentStore, openPath, setDirty } from '@/features/document';
import type { MarkdownParser } from '@/markdown/parser';
import { getPlatform, setPlatform, type DocumentPayload, type Platform, type RecentEntry } from '@/platform';

import type { TabTransfer } from '../new-window';
import { workspaceOpenerHooks } from '../opened';
import { isTabDirty, openInNewTab, resetTabs, tabMeta, tabsStore, type Tab } from '../tabs.svelte';
import { dropOutside, moveTabToWindow, receiveTab, returnToWindow, trackOutside } from './handoff';

const original = getPlatform();

const disk = new Map<string, string>();

/** 受け渡し箱。`stashTransfer` が入れ、`takeTransfer` が 1 回だけ取り出す。 */
const box = new Map<number, string>();

/** Platform へ送った指示の順序。 */
let calls: string[];

let sendTabToWindow: ReturnType<typeof vi.fn>;

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

function transferOf(path: string | null, text: string, dirty: boolean): TabTransfer {
  return {
    meta: { path, eol: 'lf', bom: false, encoding: 'utf8', mtimeMs: 1, size: text.length, readonly: false },
    text,
    dirty,
    eolOverride: null,
    scrollTop: 120,
  };
}

function paths(): (string | null)[] {
  return tabsStore.tabs.map((tab: Tab) => tabMeta(tab).path);
}

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
  vi.stubGlobal('requestIdleCallback', undefined);
  // jsdom は canvas を持たない。配色の解決は既定の色へ倒れる。
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  document.body.innerHTML = '<div id="mx-preview"></div>';

  disk.clear();
  disk.set('C:/work/a.md', '# a\n');
  disk.set('C:/work/b.md', '# b\n');
  box.clear();
  calls = [];
  sendTabToWindow = vi.fn(() => Promise.resolve());

  let nextTransfer = 1;
  setPlatform({
    ...original,
    readDocument: (path: string) =>
      disk.has(path) ? Promise.resolve(payload(path)) : Promise.reject({ kind: 'not-found', message: path }),
    pushRecent: (path: string) => Promise.resolve([{ path, openedAtMs: 1 }] as RecentEntry[]),
    removeRecent: () => Promise.resolve([] as RecentEntry[]),
    watchPath: () => Promise.resolve(),
    unwatchPath: () => Promise.resolve(),
    setDirty: () => Promise.resolve(),
    stashTransfer: (json: string) => {
      const id = nextTransfer++;
      box.set(id, json);
      return Promise.resolve(id);
    },
    takeTransfer: (id: number) => {
      const json = box.get(id) ?? null;
      box.delete(id);
      return Promise.resolve(json);
    },
    sendTabToWindow,
    beginTabDrag: (ghost) => {
      calls.push(`begin:${ghost.label}`);
      return Promise.resolve();
    },
    moveTabDrag: () => {
      calls.push('move');
      return Promise.resolve();
    },
    endTabDrag: () => {
      calls.push('end');
      return Promise.resolve('main');
    },
  } as Platform);

  documentStore.meta = null;
  documentStore.eolOverride = null;
  documentStore.notice = null;
  setDirty(false);
  resetTabs();
  configureOpener({ parser: fakeParser(), softBreak: () => false, syntax: () => [], ...workspaceOpenerHooks() });
});

afterEach(async () => {
  // 次のテストへ窓の外の状態を持ち越さない。
  await dropOutside();
  setPlatform(original);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('既にあるウィンドウへ移す', () => {
  it('ディスクと一致しているタブはパスだけを渡し、渡せたら閉じる', async () => {
    await openPath('C:/work/a.md');
    await openInNewTab(payload('C:/work/b.md'));
    const id = tabsStore.activeId ?? 0;

    expect(await moveTabToWindow(id, 'main')).toBe(true);

    expect(sendTabToWindow).toHaveBeenCalledWith('main', { paths: ['C:/work/b.md'] });
    expect(paths()).toEqual(['C:/work/a.md']);
  });

  it('未保存のタブは本文ごと受け渡し箱へ預ける', async () => {
    await openPath('C:/work/a.md');
    setDirty(true);
    const id = tabsStore.activeId ?? 0;

    expect(await moveTabToWindow(id, 'main')).toBe(true);

    const [[, handoff]] = sendTabToWindow.mock.calls as [[string, { transfer: number }]];
    const stored = JSON.parse(box.get(handoff.transfer) ?? 'null') as TabTransfer;
    expect(stored.text).toBe('# a\n');
    expect(stored.dirty).toBe(true);
  });

  it('渡す先が無ければタブを閉じず、通知を出す', async () => {
    sendTabToWindow.mockRejectedValue({ kind: 'not-found', message: 'main' });
    await openPath('C:/work/a.md');
    const id = tabsStore.activeId ?? 0;

    expect(await moveTabToWindow(id, 'main')).toBe(false);

    expect(paths()).toEqual(['C:/work/a.md']);
    expect(documentStore.notice?.level).toBe('error');
  });
});

describe('移されてきたタブを受け取る', () => {
  it('パスで届いたタブは末尾に加わる', async () => {
    await openPath('C:/work/a.md');

    expect(await receiveTab({ paths: ['C:/work/b.md'], transfer: null })).toBe(true);

    expect(paths()).toEqual(['C:/work/a.md', 'C:/work/b.md']);
    expect(tabsStore.active && tabMeta(tabsStore.active).path).toBe('C:/work/b.md');
  });

  it('本文で届いたタブは、未保存の状態とスクロール位置を保ったまま加わる', async () => {
    await openPath('C:/work/a.md');
    box.set(7, JSON.stringify(transferOf('C:/work/b.md', '# b edited\n', true)));

    expect(await receiveTab({ paths: [], transfer: 7 })).toBe(true);

    expect(paths()).toEqual(['C:/work/a.md', 'C:/work/b.md']);
    expect(documentStore.isDirty).toBe(true);
    expect(tabsStore.active?.scrollTop).toBe(120);
  });

  it('同じファイルのタブが未保存でなければ、移ってきたほうだけを残す', async () => {
    await openPath('C:/work/a.md');
    await openInNewTab(payload('C:/work/b.md'));
    box.set(7, JSON.stringify(transferOf('C:/work/a.md', '# a edited\n', true)));

    expect(await receiveTab({ paths: [], transfer: 7 })).toBe(true);

    expect(paths()).toEqual(['C:/work/b.md', 'C:/work/a.md']);
    expect(documentStore.isDirty).toBe(true);
  });

  it('同じファイルのタブにも未保存の変更があれば、どちらも捨てずに並べる', async () => {
    await openPath('C:/work/a.md');
    setDirty(true);
    box.set(7, JSON.stringify(transferOf('C:/work/a.md', '# a elsewhere\n', true)));

    expect(await receiveTab({ paths: [], transfer: 7 })).toBe(true);

    expect(paths()).toEqual(['C:/work/a.md', 'C:/work/a.md']);
    expect(tabsStore.tabs.every((tab) => isTabDirty(tab))).toBe(true);
  });

  it('受け渡し箱から取れなければ何も増えない', async () => {
    await openPath('C:/work/a.md');

    expect(await receiveTab({ paths: [], transfer: 99 })).toBe(false);

    expect(paths()).toEqual(['C:/work/a.md']);
  });
});

describe('窓の外へ引き出している間', () => {
  it('最初の 1 回で表示を出し、以後は追従させ、離すと消して落とした先を返す', async () => {
    trackOutside({ name: 'a.md', dirty: true });
    trackOutside({ name: 'a.md', dirty: true });

    expect(await dropOutside()).toBe('main');
    expect(calls).toEqual(['begin:a.md ●', 'move', 'end']);
  });

  it('窓の中へ戻ると表示を消し、もう一度出ると出し直す', async () => {
    trackOutside({ name: 'a.md', dirty: false });
    returnToWindow();
    trackOutside({ name: 'a.md', dirty: false });
    await dropOutside();

    expect(calls).toEqual(['begin:a.md', 'end', 'begin:a.md', 'end']);
  });

  it('追従の指示は前の指示が返るまで積み上げず、返った後に 1 回だけ追いつく', async () => {
    trackOutside({ name: 'a.md', dirty: false });
    for (let i = 0; i < 5; i++) trackOutside({ name: 'a.md', dirty: false });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await dropOutside();

    expect(calls).toEqual(['begin:a.md', 'move', 'move', 'end']);
  });

  it('離した後は、送っている最中の追従があっても追いかけない', async () => {
    trackOutside({ name: 'a.md', dirty: false });
    for (let i = 0; i < 5; i++) trackOutside({ name: 'a.md', dirty: false });
    await dropOutside();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(calls).toEqual(['begin:a.md', 'move', 'end']);
  });
});
