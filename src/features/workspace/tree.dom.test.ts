// @vitest-environment jsdom
/**
 * ファイルツリーの状態（F-NAV-03 / M3 Phase 5b）。
 *
 * 見たいのは遅延展開である。開いたディレクトリだけを読み、閉じたら捨てる。
 * 常駐アプリなので、一度開いただけのディレクトリを抱え続けると枚数分だけ積算する（N-PERF-06）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getPlatform, setPlatform, type DirEntry, type Platform } from '@/platform';

import { reloadTree, resetTree, setTreeRoot, setTreeRootFromFile, toggleDir, treeStore } from './tree.svelte';

const original = getPlatform();

/** 仮想のディレクトリ。`listDir` はここから答える。書き換えは `beforeEach` が戻す。 */
let disk: Record<string, DirEntry[]> = {};

const INITIAL: Record<string, DirEntry[]> = {
  'C:/work': [
    { name: 'docs', path: 'C:/work/docs', dir: true },
    { name: 'readme.md', path: 'C:/work/readme.md', dir: false },
  ],
  'C:/work/docs': [{ name: 'design.md', path: 'C:/work/docs/design.md', dir: false }],
};

let listDir: ReturnType<typeof vi.fn>;

beforeEach(() => {
  disk = structuredClone(INITIAL);
  listDir = vi.fn((path: string) => Promise.resolve(disk[path] ?? []));
  setPlatform({ ...original, listDir } as Platform);
  resetTree();
});

afterEach(() => {
  setPlatform(original);
});

describe('基点', () => {
  it('開いているファイルの親ディレクトリを基点にする', async () => {
    await setTreeRootFromFile('C:/work/readme.md');

    expect(treeStore.root).toBe('C:/work');
    expect(treeStore.entries['C:/work']).toHaveLength(2);
  });

  it('パスを持たない文書では何もしない', async () => {
    await setTreeRootFromFile(null);

    expect(treeStore.root).toBeNull();
    expect(listDir).not.toHaveBeenCalled();
  });

  it('同じ基点なら読み直さない', async () => {
    await setTreeRoot('C:/work');
    listDir.mockClear();

    await setTreeRoot('C:/work');

    expect(listDir).not.toHaveBeenCalled();
  });
});

describe('遅延展開', () => {
  it('開いたディレクトリだけを読む', async () => {
    await setTreeRoot('C:/work');

    // 基点のぶんだけ。中の `docs` はまだ読んでいない。
    expect(listDir).toHaveBeenCalledTimes(1);
    expect(treeStore.entries['C:/work/docs']).toBeUndefined();

    await toggleDir('C:/work/docs');

    expect(treeStore.expanded).toContain('C:/work/docs');
    expect(treeStore.entries['C:/work/docs']).toHaveLength(1);
  });

  it('閉じたら中身を捨てる', async () => {
    await setTreeRoot('C:/work');
    await toggleDir('C:/work/docs');

    await toggleDir('C:/work/docs');

    expect(treeStore.expanded).not.toContain('C:/work/docs');
    // 抱え続けない（N-PERF-06）。開き直せば読み直す。
    expect(treeStore.entries['C:/work/docs']).toBeUndefined();
  });

  it('読めないディレクトリは空として扱う', async () => {
    listDir.mockRejectedValueOnce(new Error('out of scope'));

    await setTreeRoot('C:/secret');

    expect(treeStore.entries['C:/secret']).toEqual([]);
  });
});

/**
 * 除外の glob は Rust 側で当たる（`explorer.exclude` / #146）。
 * ここで見たいのは、設定が変わったときに木をどう読み直すかである。
 */
describe('読み直し', () => {
  it('基点は Rust 側へ渡す。glob をどこからの相対として解釈するかが決まる', async () => {
    await setTreeRoot('C:/work');
    await toggleDir('C:/work/docs');

    expect(listDir).toHaveBeenLastCalledWith('C:/work/docs', 'C:/work');
  });

  it('開いている枝は開いたまま読み直す', async () => {
    await setTreeRoot('C:/work');
    await toggleDir('C:/work/docs');
    listDir.mockClear();

    await reloadTree();

    expect(listDir.mock.calls.map(([path]) => path)).toEqual(['C:/work', 'C:/work/docs']);
    expect(treeStore.expanded).toEqual(['C:/work/docs']);
    expect(treeStore.entries['C:/work/docs']).toHaveLength(1);
  });

  it('除外されて親から消えた枝は、開いた状態ごと捨てる', async () => {
    await setTreeRoot('C:/work');
    await toggleDir('C:/work/docs');
    treeStore.focusPath = 'C:/work/docs';

    // `docs` を除外した後の一覧に差し替える。
    disk['C:/work'] = [{ name: 'readme.md', path: 'C:/work/readme.md', dir: false }];
    await reloadTree();

    expect(treeStore.expanded).toEqual([]);
    expect(treeStore.entries['C:/work/docs']).toBeUndefined();
    // 画面のどこにも無い項目を Tab の順路に残さない。
    expect(treeStore.focusPath).toBeNull();
  });

  it('基点が無ければ何もしない', async () => {
    await reloadTree();

    expect(listDir).not.toHaveBeenCalled();
  });
});
