// @vitest-environment jsdom
/**
 * フォルダを開く（F-NAV-03）。
 *
 * 検証するのは「基点が決まるのはここを通ったときだけである」ことと、取り消したときに何も変わらないことである。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { viewStore } from '@/features/view';
import { getPlatform, setPlatform, type DirEntry, type Platform } from '@/platform';

import { openFolderViaDialog } from './open-folder';
import { resetTree, treeStore } from './tree.svelte';

const original = getPlatform();

const disk: Record<string, DirEntry[]> = {
  'C:/work': [{ name: 'readme.md', path: 'C:/work/readme.md', dir: false }],
};

let pickFolder: ReturnType<typeof vi.fn>;

beforeEach(() => {
  pickFolder = vi.fn(() => Promise.resolve<string | null>('C:/work'));
  setPlatform({
    ...original,
    pickFolder,
    listDir: (path: string) => Promise.resolve(disk[path] ?? []),
  } as Platform);
  resetTree();
  viewStore.panes.left.open = false;
});

afterEach(() => {
  setPlatform(original);
});

describe('フォルダを開く', () => {
  it('選ばれたフォルダを基点にして読み込む', async () => {
    const picked = await openFolderViaDialog();

    expect(picked).toBe('C:/work');
    expect(treeStore.root).toBe('C:/work');
    expect(treeStore.entries['C:/work']).toHaveLength(1);
  });

  // 開いた結果が見えないと、操作を受け付けたかどうかが分からない。
  it('レフトペインを開く', async () => {
    await openFolderViaDialog();

    expect(viewStore.panes.left.open).toBe(true);
  });

  it('取り消したら基点もペインも変わらない', async () => {
    pickFolder.mockResolvedValueOnce(null);

    const picked = await openFolderViaDialog();

    expect(picked).toBeNull();
    expect(treeStore.root).toBeNull();
    expect(viewStore.panes.left.open).toBe(false);
  });
});
