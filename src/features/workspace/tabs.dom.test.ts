// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { configureOpener, documentStore, openPath, setDirty, type StoredMeta } from '@/features/document';
import type { MarkdownParser } from '@/markdown/parser';
import { getPlatform, setPlatform, type DocumentPayload, type Platform, type RecentEntry } from '@/platform';

import { workspaceOpenerHooks } from './opened';
import {
  activateTab,
  closeTab,
  cycleTab,
  isTabDirty,
  moveTab,
  openInNewTab,
  openPathInNewTab,
  openPathsInTabs,
  reopenClosedTab,
  resetTabs,
  selectTabAt,
  tabsStore,
  type Tab,
} from './tabs.svelte';

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
  configureOpener({ parser: fakeParser(), softBreak: () => false, ...workspaceOpenerHooks() });
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

  it('最後の 1 枚を閉じると Welcome へ戻る', async () => {
    await openPath('C:/work/a.md');
    const id = tabsStore.activeId ?? 0;

    expect(await closeTab(id)).toBe(true);
    expect(tabsStore.tabs).toHaveLength(0);
    // 何も開いていない状態の判定はこれ 1 つ（`app/App.svelte`）
    expect(documentStore.meta).toBeNull();
    expect(document.querySelector('#mx-preview')?.textContent).toBe('');
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

describe('入口', () => {
  it('パスから新しいタブを開く', async () => {
    await openPath('C:/work/a.md');

    expect(await openPathInNewTab('C:/work/b.md')).toBe(true);
    expect(tabsStore.tabs.map((tab) => tab.meta.path)).toEqual(['C:/work/a.md', 'C:/work/b.md']);
  });

  it('既に開いているファイルは、そのタブへ切り替えるだけ', async () => {
    await openPath('C:/work/a.md');
    await openPathInNewTab('C:/work/b.md');

    await openPathInNewTab('C:/work/a.md');

    expect(tabsStore.tabs).toHaveLength(2);
    expect(tabsStore.active?.meta.path).toBe('C:/work/a.md');
  });

  it('開けなかったら枠を残さず、表示中のタブも変えない', async () => {
    await openPath('C:/work/a.md');

    expect(await openPathInNewTab('C:/work/missing.md')).toBe(false);
    expect(tabsStore.tabs).toHaveLength(1);
    expect(tabsStore.active?.meta.path).toBe('C:/work/a.md');
    // アクティブなタブは本文を持たない（退避は不要だった）
    expect(tabsStore.active?.text).toBeNull();
  });

  it('落とされた数だけタブを開く (F-OPEN-08)', async () => {
    disk.set('C:/work/c.md', '# c\n');

    await openPathsInTabs(['C:/work/a.md', 'C:/work/b.md', 'C:/work/c.md']);

    expect(tabsStore.tabs).toHaveLength(3);
    // 最後に開いたものが表示されている
    expect(documentStore.meta?.path).toBe('C:/work/c.md');
  });

  it('未保存でも、新しいタブへ開くときは確認しない', async () => {
    await openPath('C:/work/a.md');
    setDirty(true);

    await openPathInNewTab('C:/work/b.md');

    expect(confirmDiscard).not.toHaveBeenCalled();
  });

  it('未保存のタブから離れるときも確認しない', async () => {
    await openPath('C:/work/a.md');
    const first = tabsStore.activeId ?? 0;
    await openPathInNewTab('C:/work/b.md');
    await activateTab(first);
    setDirty(true);

    // 戻り先はクリーンなタブなので、ディスクから読み直す経路を通る
    await cycleTab(1);

    expect(confirmDiscard).not.toHaveBeenCalled();
    expect(documentStore.meta?.path).toBe('C:/work/b.md');
  });
});

describe('Save As でパスが変わったとき', () => {
  it('切り替えて戻ると、保存後のファイルを開く', async () => {
    await openPath('C:/work/a.md');
    const first = tabsStore.activeId ?? 0;

    // `save.ts` はストアのメタ情報を直接書き戻す。タブ側の値は古いままになる。
    disk.set('C:/work/renamed.md', '# renamed\n');
    documentStore.meta = { ...(documentStore.meta as StoredMeta), path: 'C:/work/renamed.md' };

    await openPathInNewTab('C:/work/b.md');
    await activateTab(first);

    expect(documentStore.meta?.path).toBe('C:/work/renamed.md');
  });
});

describe('キーからの操作', () => {
  it('次 / 前へ折り返して切り替える', async () => {
    await openPath('C:/work/a.md');
    await openPathInNewTab('C:/work/b.md');

    await cycleTab(1);
    expect(tabsStore.active?.meta.path).toBe('C:/work/a.md');

    await cycleTab(-1);
    expect(tabsStore.active?.meta.path).toBe('C:/work/b.md');
  });

  it('n 番目を選ぶ。無ければ何もしない', async () => {
    await openPath('C:/work/a.md');
    await openPathInNewTab('C:/work/b.md');

    expect(await selectTabAt(1)).toBe(true);
    expect(tabsStore.active?.meta.path).toBe('C:/work/a.md');
    expect(await selectTabAt(9)).toBe(false);
    expect(tabsStore.active?.meta.path).toBe('C:/work/a.md');
  });
});

describe('閉じる（続き）', () => {
  it('未保存のタブは確認してから閉じる', async () => {
    await openPath('C:/work/a.md');
    await openPathInNewTab('C:/work/b.md');
    setDirty(true);

    await closeTab(tabsStore.activeId ?? 0);

    expect(confirmDiscard).toHaveBeenCalledTimes(1);
    expect(tabsStore.tabs).toHaveLength(1);
  });

  it('取り消されたら閉じない', async () => {
    confirmDiscard.mockResolvedValue('cancel');
    await openPath('C:/work/a.md');
    await openPathInNewTab('C:/work/b.md');
    setDirty(true);

    expect(await closeTab(tabsStore.activeId ?? 0)).toBe(false);
    expect(tabsStore.tabs).toHaveLength(2);
  });

  it('表示していない未保存のタブは、表示してから尋ねる', async () => {
    await openPath('C:/work/a.md');
    const first = tabsStore.activeId ?? 0;
    setDirty(true);
    await openPathInNewTab('C:/work/b.md');

    await closeTab(first);

    // 尋ねる前に対象を表示するので、確認の時点では a.md が見えている
    expect(confirmDiscard).toHaveBeenCalledTimes(1);
    expect(tabsStore.tabs.map((tab) => tab.meta.path)).toEqual(['C:/work/b.md']);
  });

  it('閉じたタブを開き直せる (Ctrl+Shift+T)', async () => {
    await openPath('C:/work/a.md');
    await openPathInNewTab('C:/work/b.md');
    await closeTab(tabsStore.activeId ?? 0);

    expect(await reopenClosedTab()).toBe(true);
    expect(tabsStore.tabs.map((tab) => tab.meta.path)).toEqual(['C:/work/a.md', 'C:/work/b.md']);
    expect(await reopenClosedTab()).toBe(false);
  });
});

describe('並べ替え (F-NAV-02)', () => {
  /** 3 枚並べる。表示中は最後に開いた c.md。 */
  async function threeTabs(): Promise<void> {
    disk.set('C:/work/c.md', '# c\n');
    await openPath('C:/work/a.md');
    await openPathInNewTab('C:/work/b.md');
    await openPathInNewTab('C:/work/c.md');
  }

  it('指定した位置へ動かす', async () => {
    await threeTabs();
    const first = tabsStore.tabs[0]?.id ?? 0;

    expect(moveTab(first, 2)).toBe(true);

    expect(tabsStore.tabs.map((tab) => tab.meta.path)).toEqual(['C:/work/b.md', 'C:/work/c.md', 'C:/work/a.md']);
  });

  it('表示中のタブは変わらない', async () => {
    await threeTabs();
    const active = tabsStore.activeId;

    moveTab(tabsStore.tabs[2]?.id ?? 0, 0);

    expect(tabsStore.activeId).toBe(active);
    expect(documentStore.meta?.path).toBe('C:/work/c.md');
  });

  it('端は丸める。動かなければ false', async () => {
    await threeTabs();
    const first = tabsStore.tabs[0]?.id ?? 0;

    // 行き過ぎても端で止まる。
    expect(moveTab(first, 99)).toBe(true);
    expect(tabsStore.tabs.at(-1)?.meta.path).toBe('C:/work/a.md');
    // 同じ位置なら何もしない（ドラッグ中は 1 ピクセルごとに呼ばれる）。
    expect(moveTab(first, 2)).toBe(false);
  });
});
