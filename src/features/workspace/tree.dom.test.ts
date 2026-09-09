// @vitest-environment jsdom
/**
 * ファイルツリーの状態（F-NAV-03 / M3 Phase 5b）。
 *
 * 見たいのは遅延展開である。開いたディレクトリだけを読み、閉じたら捨てる。
 * 常駐アプリなので、一度開いただけのディレクトリを抱え続けると枚数分だけ積算する（N-PERF-06）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getPlatform, setPlatform, type DirEntry, type Platform } from '@/platform';

import { resetTree, setTreeRoot, setTreeRootFromFile, toggleDir, treeStore } from './tree.svelte';

const original = getPlatform();

/** 仮想のディレクトリ。`listDir` はここから答える。 */
const disk: Record<string, DirEntry[]> = {
  'C:/work': [
    { name: 'docs', path: 'C:/work/docs', dir: true },
    { name: 'readme.md', path: 'C:/work/readme.md', dir: false },
  ],
  'C:/work/docs': [{ name: 'design.md', path: 'C:/work/docs/design.md', dir: false }],
};

let listDir: ReturnType<typeof vi.fn>;

beforeEach(() => {
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
