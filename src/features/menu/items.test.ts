// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';

import { documentStore } from '@/features/document/store.svelte';
import { recentStore } from '@/features/workspace/recent.svelte';
import type { DocumentMeta } from '@/platform';

import { buildMenu, MENU_RECENT_SHOWN, type MenuGroup } from './items';

const META: DocumentMeta = {
  path: 'C:\\Users\\me\\repos\\marxdown\\README.md',
  eol: 'lf',
  bom: false,
  encoding: 'utf8',
  mtimeMs: 0,
  size: 1024,
  readonly: false,
};

function ids(groups: MenuGroup[]): string[] {
  return groups.flatMap((g) => g.items.map((i) => i.id));
}

function group(groups: MenuGroup[], id: string): MenuGroup | undefined {
  return groups.find((g) => g.id === id);
}

beforeEach(() => {
  documentStore.meta = null;
  recentStore.entries = [];
});

describe('ハンバーガーメニューの項目 (03.ux-spec.md §2.3)', () => {
  /**
   * Principle 3「Simple Means Low Cognitive Load」。
   * ファイルを開いていないときの再読み込み・倍率・検索は押しても何も起きない。
   */
  it('ファイルを開いていないときは、押しても何も起きない項目を並べない', () => {
    const groups = buildMenu();

    expect(ids(groups)).toEqual(['open']);
    expect(group(groups, 'document')).toBeUndefined();
    expect(group(groups, 'zoom')).toBeUndefined();
  });

  it('ファイルを開くと、その文書に対する操作が増える', () => {
    documentStore.meta = META;

    expect(ids(buildMenu())).toEqual(['open', 'reload', 'search', 'zoom-in', 'zoom-out', 'zoom-reset']);
  });

  /** 履歴が空でも見出しは出す。**項目ではなく 1 行の文**で埋める。 */
  it('履歴が空のときは、押せない項目の代わりに文を出す', () => {
    const recent = group(buildMenu(), 'recent');

    expect(recent?.items).toEqual([]);
    expect(recent?.empty).toBeTruthy();
  });

  /** ここが伸びると、メニューが「履歴ビューア」という別の道具に化ける。 */
  it('最近開いたファイルは上限までしか並べない', () => {
    recentStore.entries = Array.from({ length: MENU_RECENT_SHOWN + 5 }, (_, i) => ({
      path: `C:\\notes\\note-${String(i)}.md`,
      openedAtMs: i,
    }));

    expect(group(buildMenu(), 'recent')?.items).toHaveLength(MENU_RECENT_SHOWN);
  });

  it('最近開いたファイルは、名前とディレクトリに割って出す', () => {
    recentStore.entries = [{ path: META.path, openedAtMs: 0 }];

    const [entry] = group(buildMenu(), 'recent')?.items ?? [];

    expect(entry?.label).toBe('README.md');
    expect(entry?.detail).toBe('C:\\Users\\me\\repos\\marxdown');
    // 省略されて読めなくなるので、完全なパスはツールチップに残す
    expect(entry?.title).toBe(META.path);
  });

  /**
   * 後続の Phase（4 で「設定」、7 で「終了」）が項目を足す。
   * `{#each}` のキーに使うので、重複すると描画が壊れる。
   */
  it('項目の id が重複しない', () => {
    documentStore.meta = META;
    recentStore.entries = [{ path: META.path, openedAtMs: 0 }];

    const all = ids(buildMenu());

    expect(new Set(all).size).toBe(all.length);
  });
});
