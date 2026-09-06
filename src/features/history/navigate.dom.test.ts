// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { configureOpener, openPath, previewScrollTop, reloadCurrent } from '@/features/document/open';
import { documentStore } from '@/features/document/store.svelte';
import type { MarkdownParser } from '@/markdown/parser';
import { getPlatform, setPlatform, type DocumentPayload, type Platform } from '@/platform';

import { canGoBack, canGoForward, resetHistory } from './history';
import { configureHistory, goBack, goForward } from './navigate';

const original = getPlatform();

function payload(path: string): DocumentPayload {
  return {
    path,
    content: `# ${path}\n`,
    eol: 'lf',
    bom: false,
    encoding: 'utf8',
    mtimeMs: 1,
    size: 8,
    readonly: false,
  };
}

/** Worker を立てずに `MarkdownParser` の形だけ満たす（`open.dom.test.ts` と同じ）。 */
function fakeParser(): MarkdownParser {
  return {
    parse: (text) =>
      Promise.resolve({
        id: 1,
        chunks: [`<h1>${text.length}</h1>`],
        outline: [],
        frontMatter: null,
        parseMs: 0.1,
        textStats: { chars: text.length, words: 1, readingMinutes: 1 },
      }),
    dispose: () => {},
  };
}

let container: HTMLElement;
let missing: Set<string>;

/** 本文のスクロール位置。jsdom はレイアウトしないので、書き込める形にしておく。 */
function setScroll(top: number): void {
  container.scrollTop = top;
}

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
  vi.stubGlobal('requestIdleCallback', undefined);

  missing = new Set();
  setPlatform({
    ...original,
    readDocument: (path: string) =>
      missing.has(path) ? Promise.reject({ kind: 'not-found', message: path }) : Promise.resolve(payload(path)),
    pushRecent: () => Promise.resolve([]),
    removeRecent: () => Promise.resolve([]),
    watchPath: () => Promise.resolve(),
  } as Platform);

  document.body.innerHTML = '<div id="mx-preview"></div>';
  container = document.querySelector('#mx-preview') as HTMLElement;
  // jsdom の scrollTop は常に 0 に落ちるので、素直な数値として振る舞わせる
  let scrollTop = 0;
  Object.defineProperty(container, 'scrollTop', {
    get: () => scrollTop,
    set: (value: number) => {
      scrollTop = value;
    },
  });

  configureOpener({ parser: fakeParser() });
  // 開き直しの手は `app/bootstrap.ts` が渡す。ここでは同じ形を組み立てる。
  configureHistory({
    scrollTop: previewScrollTop,
    reopen: async (path, scrollTop) =>
      Boolean(await openPath(path, { resetScroll: false, restoreScroll: scrollTop, history: false, remember: false })),
  });
  documentStore.meta = null;
  resetHistory();
});

afterEach(() => {
  setPlatform(original);
  vi.unstubAllGlobals();
});

describe('戻る / 進む (F-NAV-07 / Alt+← / Alt+→)', () => {
  it('リンクで辿った先から元のファイルへ戻れる', async () => {
    await openPath('a.md');
    await openPath('b.md');

    await goBack();

    expect(documentStore.meta?.path).toBe('a.md');
    expect(canGoForward()).toBe(true);

    await goForward();

    expect(documentStore.meta?.path).toBe('b.md');
  });

  /** 06.roadmap/m1.5-shell-and-settings.md §2「スクロール位置も一緒に戻すこと」。 */
  it('読んでいた位置ごと戻る', async () => {
    await openPath('a.md');
    setScroll(1400);
    await openPath('b.md');

    // 開いた直後は先頭
    expect(container.scrollTop).toBe(0);

    await goBack();

    expect(container.scrollTop).toBe(1400);
  });

  it('再読み込み（F5 / 外部変更）は履歴に積まない', async () => {
    await openPath('a.md');
    await openPath('b.md');

    await reloadCurrent();
    await reloadCurrent();

    await goBack();

    // 積んでいたら、ここで b.md のまま止まる
    expect(documentStore.meta?.path).toBe('a.md');
    expect(canGoBack()).toBe(false);
  });

  it('履歴を辿る移動そのものは履歴に積まない', async () => {
    await openPath('a.md');
    await openPath('b.md');

    await goBack();
    await goBack();

    // 1 枚目より前へは行けない。**積んでいたら往復し続けられてしまう**
    expect(documentStore.meta?.path).toBe('a.md');
  });

  it('戻った先が消えていたら、押した回数と段数がずれない', async () => {
    await openPath('a.md');
    await openPath('b.md');
    await openPath('c.md');
    missing.add('b.md');

    await goBack();

    // 開けなかったので本文は c.md のまま。通知は openPath が出している
    expect(documentStore.meta?.path).toBe('c.md');
    expect(documentStore.notice?.level).toBe('error');

    // もう一度押せば、同じ b.md を試す（黙って a.md へ飛び越えない）
    expect(canGoBack()).toBe(true);
  });
});
