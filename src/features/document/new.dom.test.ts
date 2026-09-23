// @vitest-environment jsdom
/**
 * 新規ファイル（`Ctrl+N` / 03.ux-spec/04-keybindings.md §3 / `document/new.ts`）。
 *
 * 見たいのは「パスが無いこと」の波及である。
 * 無題の文書は、対応を忘れると表面に出ない形で壊れる場所を 4 つ持っている（最近開いたファイルに加えると開き直せない項目が残る、戻る/進むで戻った先に本文が無い、ファイル監視が存在しないパスを見に行く、保存先が決まらない）。
 * どれも画面には何も出ない形で壊れるため、ここで固定しておく。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { openUntitledTab, recentStore, resetTabs, tabsStore, workspaceOpenerHooks } from '@/features/workspace';
import type { MarkdownParser } from '@/markdown/parser';
import { getPlatform, setPlatform, type Platform } from '@/platform';

const { configureOpener } = await import('./open');
const { documentStore } = await import('./store.svelte');
const { setDirty } = await import('./dirty');

const original = getPlatform();

function fakeParser(): MarkdownParser {
  return {
    parse: (text) =>
      Promise.resolve({
        id: 1,
        chunks: [`<p>${text.length}</p>`],
        outline: [],
        frontMatter: null,
        parseMs: 0.1,
        textStats: { chars: text.length, words: 0, readingMinutes: 1 },
      }),
    dispose: () => {},
  };
}

const pushRecent = vi.fn(() => Promise.resolve([]));
const watchPath = vi.fn(() => Promise.resolve());
const confirmDiscard = vi.fn(() => Promise.resolve('discard' as const));

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
  vi.stubGlobal('requestIdleCallback', undefined);

  document.body.innerHTML = '<div id="mx-preview"></div>';
  documentStore.meta = null;
  documentStore.notice = null;
  documentStore.statusMessage = null;
  documentStore.eolOverride = null;
  setDirty(false);
  recentStore.entries = [];

  pushRecent.mockClear();
  watchPath.mockClear();
  confirmDiscard.mockClear();

  setPlatform({
    ...original,
    pushRecent,
    watchPath,
    confirmDiscard,
    setDirty: () => Promise.resolve(),
  } as unknown as Platform);
  resetTabs();
  configureOpener({ parser: fakeParser(), softBreak: () => false, syntax: () => [], ...workspaceOpenerHooks() });
});

describe('新規ファイル', () => {
  it('パスを持たない空の文書が開く', async () => {
    expect(await openUntitledTab()).toBe(true);

    expect(documentStore.meta).not.toBeNull();
    expect(documentStore.meta?.path).toBeNull();
    expect(documentStore.meta?.encoding).toBe('utf8');
    expect(documentStore.meta?.eol).toBe('lf');
    expect(documentStore.meta?.bom).toBe(false);
    // 作った直後は未保存の変更が無い。打って初めてダーティになる。
    expect(documentStore.isDirty).toBe(false);
  });

  it('最近開いたファイルにも監視にも載せない', async () => {
    await openUntitledTab();

    expect(pushRecent).not.toHaveBeenCalled();
    expect(watchPath).not.toHaveBeenCalled();
  });

  it('新しいタブとして開く。いまの文書は残る', async () => {
    // 置き換えないので、未保存の確認も通らない。
    await openUntitledTab();
    setDirty(true);

    await openUntitledTab();

    expect(tabsStore.tabs).toHaveLength(2);
    expect(confirmDiscard).not.toHaveBeenCalled();
  });
});
