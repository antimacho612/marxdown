// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { recentStore, resetTabs, workspaceOpenerHooks } from '@/features/workspace';
import { ja } from '@/i18n/ja';
import type { MarkdownParser } from '@/markdown/parser';
import type { ParseResult } from '@/markdown/protocol';
import { getPlatform, setPlatform, type DocumentPayload, type Platform, type RecentEntry } from '@/platform';

import { configureOpener, openDocument, openPath, openViaDialog, reloadCurrent } from './open';
import { documentStore } from './store.svelte';

const original = getPlatform();

function payload(path: string, content = '# hello\n\ntext\n'): DocumentPayload {
  return {
    path,
    content,
    eol: 'lf',
    bom: false,
    encoding: 'utf8',
    mtimeMs: 1,
    size: content.length,
    readonly: false,
  };
}

/** Worker を立てずに `MarkdownParser` の形だけ満たす。 */
function fakeParser(): MarkdownParser {
  return {
    parse: (text) =>
      Promise.resolve({
        id: 1,
        chunks: [`<p>${text.length}</p>`],
        outline: [{ level: 1, text: 'hello', slug: 'hello', line: 0 }],
        frontMatter: null,
        parseMs: 0.5,
        textStats: { chars: text.length, words: 2, readingMinutes: 1 },
      }),
    dispose: () => {},
  };
}

interface Spies {
  readDocument: ReturnType<typeof vi.fn>;
  pushRecent: ReturnType<typeof vi.fn>;
  removeRecent: ReturnType<typeof vi.fn>;
  pickFile: ReturnType<typeof vi.fn>;
}

function install(overrides: Partial<Platform> = {}): Spies {
  const spies: Spies = {
    readDocument: vi.fn((path: string) => Promise.resolve(payload(path))),
    pushRecent: vi.fn((path: string) => Promise.resolve([{ path, openedAtMs: 1 }] as RecentEntry[])),
    removeRecent: vi.fn(() => Promise.resolve([] as RecentEntry[])),
    pickFile: vi.fn(() => Promise.resolve(null)),
  };
  setPlatform({ ...original, ...spies, ...overrides } as Platform);
  return spies;
}

/** `openDocument` は次の rAF を待つ。jsdom には無いので即時に回す。 */
beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
  vi.stubGlobal('requestIdleCallback', undefined);

  document.body.innerHTML = '<div id="mx-preview"></div>';
  documentStore.meta = null;
  documentStore.outline = [];
  documentStore.frontMatter = null;
  documentStore.stats = null;
  documentStore.notice = null;
  documentStore.isDirty = false;
  recentStore.entries = [];

  resetTabs();
  configureOpener({ parser: fakeParser(), softBreak: () => false, ...workspaceOpenerHooks() });
});

afterEach(() => {
  setPlatform(original);
  vi.unstubAllGlobals();
});

describe('install', () => {
  it('読み込み → パース → 描画 → 派生状態の更新まで一度に進む', async () => {
    install();

    const outcome = await openPath('C:/work/a.md');

    expect(outcome).not.toBeNull();
    expect(documentStore.meta?.path).toBe('C:/work/a.md');
    expect(documentStore.outline).toHaveLength(1);
    expect(documentStore.stats?.chunks).toBe(1);
    expect(document.querySelector('#mx-preview')?.textContent).not.toBe('');
  });

  it('開いたファイルを最近開いたファイルに積む (F-OPEN-09)', async () => {
    const spies = install();

    await openPath('C:/work/a.md');

    expect(spies.pushRecent).toHaveBeenCalledWith('C:/work/a.md');
    expect(recentStore.entries[0]?.path).toBe('C:/work/a.md');
  });

  it('remember: false なら履歴に積まない', async () => {
    const spies = install();

    await openDocument(payload('C:/work/a.md'), { remember: false });

    expect(spies.pushRecent).not.toHaveBeenCalled();
  });

  it('前の通知は開いた時点で消える', async () => {
    install();
    documentStore.notice = { level: 'error', message: '前のエラー' };

    await openPath('C:/work/a.md');

    expect(documentStore.notice).toBeNull();
  });

  it('開けなかったら通知を出し、本文は差し替えない', async () => {
    install({
      readDocument: vi.fn(() => Promise.reject({ kind: 'permission-denied', message: 'x' })),
    });

    const outcome = await openPath('C:/work/secret.md');

    expect(outcome).toBeNull();
    expect(documentStore.meta).toBeNull();
    expect(documentStore.notice?.level).toBe('error');
    expect(documentStore.notice?.message).toContain('C:/work/secret.md');
  });

  it('消えたファイルは履歴から外す（次の起動で同じ失敗を踏まないため）', async () => {
    const spies = install({
      readDocument: vi.fn(() => Promise.reject({ kind: 'not-found', message: 'x' })),
    });

    await openPath('C:/work/gone.md');

    expect(spies.removeRecent).toHaveBeenCalledWith('C:/work/gone.md');
  });

  it('読めなかっただけのファイルは履歴に残す', async () => {
    const spies = install({
      readDocument: vi.fn(() => Promise.reject({ kind: 'permission-denied', message: 'x' })),
    });

    await openPath('C:/work/locked.md');

    expect(spies.removeRecent).not.toHaveBeenCalled();
  });
});

describe('configureOpener', () => {
  it('シェル描画はパース送信の後、描画結果を待つ前に呼ばれる', async () => {
    install();
    const order: string[] = [];

    // lib は ES2023 なので Promise.withResolvers は使えない
    let resolveParse!: (r: ParseResult) => void;
    const parsed = new Promise<ParseResult>((resolve) => {
      resolveParse = resolve;
    });
    configureOpener({
      parser: {
        parse: () => {
          order.push('parse-posted');
          return parsed;
        },
        dispose: () => {},
      },
      softBreak: () => false,
      ...workspaceOpenerHooks(),
    });

    const opening = openDocument(payload('C:/work/a.md'), {
      betweenParseAndPaint: () => order.push('shell'),
    });

    // ここまでで、パースは投げ終わっていてシェルも描かれている
    expect(order).toEqual(['parse-posted', 'shell']);

    resolveParse({
      id: 1,
      chunks: ['<p>x</p>'],
      outline: [],
      frontMatter: null,
      parseMs: 0.1,
      textStats: { chars: 1, words: 1, readingMinutes: 1 },
    });
    await opening;

    expect(document.querySelector('#mx-preview')?.textContent).toBe('x');
  });
});

describe('openViaDialog', () => {
  it('選ばれたファイルを開く', async () => {
    const spies = install({ pickFile: vi.fn(() => Promise.resolve('C:/work/picked.md')) });

    await openViaDialog();

    expect(spies.readDocument).toHaveBeenCalledWith('C:/work/picked.md', undefined);
    expect(documentStore.meta?.path).toBe('C:/work/picked.md');
  });

  it('取り消しは失敗ではない。何も起きず、通知も出ない', async () => {
    const spies = install();

    const outcome = await openViaDialog();

    expect(outcome).toBeNull();
    expect(spies.readDocument).not.toHaveBeenCalled();
    expect(documentStore.notice).toBeNull();
  });
});

/**
 * jsdom はレイアウトを持たないので `scrollTop` の書き込みが観測できない。
 * 書き込みの履歴を残す形に差し替えて、「戻した / 戻さなかった」を見えるようにする。
 */
function trackScrollTop(element: HTMLElement): number[] {
  const writes: number[] = [];
  Object.defineProperty(element, 'scrollTop', {
    configurable: true,
    get: () => writes.at(-1) ?? 0,
    set: (value: number) => {
      writes.push(value);
    },
  });
  return writes;
}

describe('reloadCurrent', () => {
  it('いま開いているファイルをディスクから読み直す', async () => {
    const spies = install();
    await openPath('C:/work/b.md');
    spies.readDocument.mockClear();
    spies.pushRecent.mockClear();

    const outcome = await reloadCurrent();

    expect(outcome).not.toBeNull();
    // 第 2 引数はエンコーディングの**指定**。通常の経路では渡さず、
    // Rust 側の推定に任せる（03.ux-spec/07-status-and-notifications.md §3 の再解釈だけが渡す）。
    expect(spies.readDocument).toHaveBeenCalledWith('C:/work/b.md', undefined);
    expect(documentStore.meta?.path).toBe('C:/work/b.md');
    // 既に一覧の先頭にあるファイル。順序は変わらないので積み直さない
    expect(spies.pushRecent).not.toHaveBeenCalled();
  });

  it('スクロール位置を保つ（別のファイルを開く経路は先頭に戻す）', async () => {
    install();
    const container = document.querySelector<HTMLElement>('#mx-preview');
    if (!container) throw new Error('#mx-preview が無い');
    const writes = trackScrollTop(container);

    await openPath('C:/work/b.md');
    expect(writes.at(-1)).toBe(0);

    container.scrollTop = 400;
    await reloadCurrent();

    expect(writes.at(-1)).toBe(400);
  });

  it('再読み込みしたことを情報通知で伝える（内容が同じでも画面は動かないため）', async () => {
    install();
    await openPath('C:/work/b.md');

    await reloadCurrent();

    expect(documentStore.notice).toMatchObject({
      level: 'info',
      message: ja.open.reloaded,
    });
  });

  it('何も開いていなければ何もしない', async () => {
    const spies = install();

    const outcome = await reloadCurrent();

    expect(outcome).toBeNull();
    expect(spies.readDocument).not.toHaveBeenCalled();
    expect(documentStore.notice).toBeNull();
  });

  /**
   * エンコーディングの再解釈（03.ux-spec/07-status-and-notifications.md §3 / `document/encoding.ts`）。
   *
   * **読み直しの経路は増やさない。** スクロールを保つことも履歴に積まないことも
   * `F5` と同じでよく、違うのは指定を 1 つ渡すことだけである。
   */
  it('エンコーディングを指定して読み直せる', async () => {
    const spies = install();
    await openPath('C:/work/b.md');
    spies.readDocument.mockClear();

    await reloadCurrent({ encoding: 'shift-jis' });

    expect(spies.readDocument).toHaveBeenCalledWith('C:/work/b.md', 'shift-jis');
  });

  it('読み直せなくなっていたら通知を出し、本文はそのまま残す', async () => {
    install();
    await openPath('C:/work/b.md');
    install({
      readDocument: vi.fn(() => Promise.reject({ kind: 'not-found', message: 'no such file' })),
    });

    const outcome = await reloadCurrent();

    expect(outcome).toBeNull();
    expect(documentStore.notice?.level).toBe('error');
    expect(documentStore.meta?.path).toBe('C:/work/b.md');
  });
});

/**
 * 未保存のまま別の文書へ移るときの確認（F-EDIT-03 / N-REL-01 / `discard.ts`）。
 *
 * **入口は 5 つあるが、確認は 1 か所にしか無い。** `openPath` を通らない
 * 「開く」を作らない限り、どの入口からでも同じ確認が挟まる。
 */
describe('未保存の変更があるとき', () => {
  it('キャンセルされたら、読み込みにも行かない', async () => {
    const spies = install({ confirmDiscard: () => Promise.resolve('cancel' as const) });
    documentStore.isDirty = true;

    expect(await openPath('C:/notes/a.md')).toBeNull();
    // **尋ねるのは I/O より前。** 開くと決まっていないのにファイルを読まない。
    expect(spies.readDocument).not.toHaveBeenCalled();
  });

  it('「保存しない」なら、そのまま開く', async () => {
    const spies = install({ confirmDiscard: () => Promise.resolve('discard' as const) });
    documentStore.isDirty = true;

    expect(await openPath('C:/notes/a.md')).not.toBeNull();
    expect(spies.readDocument).toHaveBeenCalledOnce();
    // 開き直した以上、ディスクと一致した状態から始まる。
    expect(documentStore.isDirty).toBe(false);
  });

  it('ダーティでなければ尋ねない', async () => {
    const confirmDiscard = vi.fn(() => Promise.resolve('cancel' as const));
    install({ confirmDiscard });

    await openPath('C:/notes/a.md');

    expect(confirmDiscard).not.toHaveBeenCalled();
  });

  /** `F5` も同じ入口を通る。Phase 2 の時点では、ここが素通りだった。 */
  it('再読み込み（F5）でも確認する', async () => {
    install({ confirmDiscard: () => Promise.resolve('cancel' as const) });
    await openPath('C:/notes/a.md');
    documentStore.isDirty = true;

    const spies = install({ confirmDiscard: () => Promise.resolve('cancel' as const) });
    await reloadCurrent();

    expect(spies.readDocument).not.toHaveBeenCalled();
  });
});
