// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { recentStore, resetTabs, workspaceOpenerHooks } from '@/features/workspace';
import { t } from '@/i18n';
import type { MarkdownParser } from '@/markdown/parser';
import { getPlatform, setPlatform, type DocumentPayload, type FileChange, type Platform } from '@/platform';

import { configureOpener, openPath } from './open';
import { documentStore } from './store.svelte';
import { installFileWatch } from './watch';

const original = getPlatform();

function payload(path: string, content = '# hello\n'): DocumentPayload {
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

function fakeParser(): MarkdownParser {
  return {
    parse: (text) =>
      Promise.resolve({
        id: 1,
        chunks: [`<p>${text.length}</p>`],
        blocks: [`<p>${text.length}</p>`],
        outline: [],
        frontMatter: null,
        parseMs: 0.5,
        textStats: { chars: text.length, words: 1, readingMinutes: 1 },
      }),
    dispose: () => {},
  };
}

interface Harness {
  /** Rust 側が送る外部変更イベントの代わり。 */
  emit: (change: FileChange) => void;
  readDocument: ReturnType<typeof vi.fn>;
  watchPath: ReturnType<typeof vi.fn>;
}

function install(): Harness {
  let handler: (change: FileChange) => void = () => {};
  const readDocument = vi.fn((path: string) => Promise.resolve(payload(path)));
  const watchPath = vi.fn(() => Promise.resolve());

  setPlatform({
    ...original,
    readDocument,
    watchPath,
    pushRecent: vi.fn(() => Promise.resolve([])),
    onFileChanged: (h: (change: FileChange) => void) => {
      handler = h;
      return () => {};
    },
  } as Platform);

  installFileWatch();
  return { emit: (change) => handler(change), readDocument, watchPath };
}

function changed(path: string, kind: FileChange['kind'] = 'modified'): FileChange {
  return { path, mtimeMs: 2, kind };
}

/** 描画は `open.ts` の担当。ここでは rAF と受け皿だけ用意する。 */
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
  documentStore.isDirty = false;
  recentStore.entries = [];

  resetTabs();
  configureOpener({ parser: fakeParser(), softBreak: () => false, syntax: () => [], ...workspaceOpenerHooks() });
});

/** F-EDIT-16。 */
describe('外部変更の自動反映', () => {
  it('開いているファイルを読み直し、ステータスバーで伝える', async () => {
    const h = install();
    await openPath('C:/work/a.md');
    h.readDocument.mockClear();

    h.emit(changed('C:/work/a.md'));
    // ダーティでなければ失われるものが無い。尋ねずに読み込み、本文を隠さないステータスバーに出す
    await vi.waitFor(() => expect(documentStore.statusMessage).toBe(t.open.reloadedExternal));

    expect(documentStore.notice).toBeNull();
    expect(h.readDocument).toHaveBeenCalledWith('C:/work/a.md', undefined);
  });

  it('開いていないファイルの変更は無視する', async () => {
    const h = install();
    await openPath('C:/work/a.md');
    h.readDocument.mockClear();

    h.emit(changed('C:/work/other.md'));
    await Promise.resolve();

    expect(h.readDocument).not.toHaveBeenCalled();
  });

  /** 消えたファイルを読みに行くと「開けません」が出て、作り直されるともう一度出る。 */
  it('消えたファイルは読みに行かないし、通知も出さない', async () => {
    const h = install();
    await openPath('C:/work/a.md');
    h.readDocument.mockClear();
    documentStore.notice = null;
    documentStore.statusMessage = null;

    h.emit(changed('C:/work/a.md', 'removed'));
    await Promise.resolve();

    expect(h.readDocument).not.toHaveBeenCalled();
    expect(documentStore.notice).toBeNull();
    expect(documentStore.statusMessage).toBeNull();
    expect(documentStore.meta?.path).toBe('C:/work/a.md');
  });

  it('読み直しは重ねないが、途中の変更は終わってから拾い直す', async () => {
    const h = install();
    await openPath('C:/work/a.md');
    h.readDocument.mockClear();

    // 1 本目の読み込みを止めたまま、次の変更を届かせる
    let release: () => void = () => {};
    h.readDocument.mockImplementationOnce(
      (path: string) =>
        new Promise<DocumentPayload>((resolve) => {
          release = () => resolve(payload(path));
        }),
    );

    h.emit(changed('C:/work/a.md'));
    h.emit(changed('C:/work/a.md'));
    await Promise.resolve();
    expect(h.readDocument, '重ねて読まない').toHaveBeenCalledTimes(1);

    release();
    // 破棄すると画面が古いまま止まるので、終わってからもう一度読む
    await vi.waitFor(() => expect(h.readDocument).toHaveBeenCalledTimes(2));
  });
});

/** N-PERF-05「開いているファイルだけを見る」。 */
describe('監視の付け替え', () => {
  it('開いたファイルを監視対象にする', async () => {
    const h = install();

    await openPath('C:/work/a.md');
    await vi.waitFor(() => expect(h.watchPath).toHaveBeenCalledWith('C:/work/a.md'));

    await openPath('C:/work/b.md');
    await vi.waitFor(() => expect(h.watchPath).toHaveBeenLastCalledWith('C:/work/b.md'));
  });
});

/**
 * 編集中の外部変更（N-REL-02）。
 *
 * ここが「ユーザーの入力を絶対に失わない」の実装そのもの。
 * 自動で読み直すと、打った内容が通知なく消える。
 */
describe('編集中に外部変更が来たとき', () => {
  it('読み直さず、消えない警告で選ばせる', async () => {
    const h = install();
    await openPath('C:/work/a.md');
    documentStore.isDirty = true;
    h.readDocument.mockClear();

    // `notice` にリテラルを代入すると、そこから先で型が `null` に狭まる。
    // 開いた時点で既に null なので、代入せずに進む。
    h.emit(changed('C:/work/a.md'));
    await vi.waitFor(() => expect(documentStore.notice).not.toBeNull());

    const notice = documentStore.notice;
    expect(h.readDocument).not.toHaveBeenCalled();
    // 自動で消えると、気づかないまま古い内容を保存することになる。通知バーには消える仕組みを持たせていない
    expect(notice).toMatchObject({ level: 'warning', message: t.open.changedExternally });
  });

  it('「再読み込み」を選ぶと読み直す', async () => {
    const h = install();
    await openPath('C:/work/a.md');
    documentStore.isDirty = true;
    h.readDocument.mockClear();

    h.emit(changed('C:/work/a.md'));
    await vi.waitFor(() => expect(documentStore.notice?.actions).toHaveLength(2));

    documentStore.notice?.actions?.[0]?.run();
    await vi.waitFor(() => expect(h.readDocument).toHaveBeenCalledWith('C:/work/a.md', undefined));
    expect(documentStore.isDirty).toBe(false);
  });

  it('「無視」を選んでもダーティのまま残す', async () => {
    // clean にすると、保存時の衝突検知という安全網まで外れる。
    const h = install();
    await openPath('C:/work/a.md');
    documentStore.isDirty = true;
    h.readDocument.mockClear();

    h.emit(changed('C:/work/a.md'));
    await vi.waitFor(() => expect(documentStore.notice?.actions).toHaveLength(2));

    documentStore.notice?.actions?.[1]?.run();
    expect(documentStore.notice).toBeNull();
    expect(documentStore.isDirty).toBe(true);
    expect(h.readDocument).not.toHaveBeenCalled();
  });
});
