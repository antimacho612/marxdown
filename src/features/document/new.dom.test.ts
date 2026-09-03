// @vitest-environment jsdom
/**
 * 新規ファイル（`Ctrl+N` / 03.ux-spec/04-keybindings.md §3 / `document/new.ts`）。
 *
 * 見たいのは「パスが無いこと」の波及である。
 * 無題の文書は、対応を忘れると静かに壊れる場所を 4 つ持っている（最近開いたファイルに積むと開き直せない項目が残る、戻る/進むで戻った先に本文が無い、ファイル監視が存在しないパスを見に行く、保存先が決まらない）。
 * どれも画面には何も出ない形で壊れるため、ここで固定しておく。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { recentStore } from '@/features/workspace/recent.svelte';
import type { MarkdownParser } from '@/markdown/parser';
import { getPlatform, setPlatform, type Platform } from '@/platform';

/**
 * モードの切り替えはモックする。**実体は Monaco をロードする**（`open-editor.ts`）ので、
 * ここで通すと本題と関係のない数秒がかかる。見たいのは「Edit へ移すこと」だけ。
 */
const setMode = vi.fn((_mode: string) => Promise.resolve());
vi.mock('@/features/view/mode', () => ({
  setMode: (mode: string) => setMode(mode),
}));

const { configureOpener } = await import('./open');
const { newDocument } = await import('./new');
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
  documentStore.eolOverride = null;
  setDirty(false);
  recentStore.entries = [];

  setMode.mockClear();
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
  configureOpener({ parser: fakeParser() });
});

describe('新規ファイル', () => {
  it('パスを持たない空の文書が開く', async () => {
    expect(await newDocument()).toBe(true);

    expect(documentStore.meta).not.toBeNull();
    expect(documentStore.meta?.path).toBeNull();
    expect(documentStore.meta?.encoding).toBe('utf8');
    expect(documentStore.meta?.eol).toBe('lf');
    expect(documentStore.meta?.bom).toBe(false);
    // 作った直後は未保存の変更が無い。**打って初めてダーティになる。**
    expect(documentStore.isDirty).toBe(false);
  });

  it('最近開いたファイルにも監視にも載せない', async () => {
    await newDocument();

    expect(pushRecent).not.toHaveBeenCalled();
    expect(watchPath).not.toHaveBeenCalled();
  });

  it('打てる場所へ移す（空の本文を Preview で開いても何も見えない）', async () => {
    await newDocument();

    expect(setMode).toHaveBeenCalledWith('edit');
  });

  it('未保存の変更があるときは確認を通る', async () => {
    setDirty(true);
    confirmDiscard.mockResolvedValueOnce('cancel' as never);

    expect(await newDocument()).toBe(false);

    expect(confirmDiscard).toHaveBeenCalled();
    // 取り消したので、文書は差し替わっていない。
    expect(documentStore.meta).toBeNull();
    expect(setMode).not.toHaveBeenCalled();
  });
});
