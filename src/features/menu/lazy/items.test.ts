// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { registerAppCommands } from '@/app/commands';
import { documentStore } from '@/features/document';
import { viewStore } from '@/features/view';
import { recentStore } from '@/features/workspace';
import type { DocumentMeta } from '@/platform';

import { buildMenu, MENU_RECENT_SHOWN, type MenuGroup } from './items';

/**
 * **実物の表を使う。**
 *
 * メニューは `CommandId` しか持たず、何を並べるかは `app/commands.ts` の
 * `isListed` が決める（06.roadmap/m2-editor.md §1.2）。差し替えたダミーで試すと、
 * 「id は合っているのに実体が無い」という一番起きやすい壊れ方を見逃す。
 */
let uninstall: () => void = () => {};

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

function label(groups: MenuGroup[], itemId: string): string | undefined {
  return groups.flatMap((g) => g.items).find((i) => i.id === itemId)?.label;
}

beforeEach(() => {
  documentStore.meta = null;
  recentStore.entries = [];
  viewStore.mode = 'preview';
  uninstall = registerAppCommands();
});

afterEach(() => {
  uninstall();
});

describe('ハンバーガーメニューの項目 (03.ux-spec/01-screen-layout.md §3)', () => {
  /**
   * Principle 3「Simple Means Low Cognitive Load」。
   * ファイルを開いていないときの再読み込み・倍率・検索は押しても何も起きない。
   */
  it('ファイルを開いていないときは、押しても何も起きない項目を並べない', () => {
    const groups = buildMenu();

    // 「新規ファイル」「設定」「終了」は文書に依存しないので、ここでも押せる。
    expect(ids(groups)).toEqual(['open', 'open-folder', 'new', 'palette', 'settings', 'quit']);
    expect(group(groups, 'document')).toBeUndefined();
    expect(group(groups, 'zoom')).toBeUndefined();
  });

  it('ファイルを開くと、その文書に対する操作が増える', () => {
    documentStore.meta = META;

    expect(ids(buildMenu())).toEqual([
      'open',
      'open-folder',
      'new',
      'save',
      'save-as',
      'mode',
      'split',
      'reload',
      'search',
      'outline',
      'jump',
      'zoom-in',
      'zoom-out',
      'zoom-reset',
      'palette',
      'settings',
      'quit',
    ]);
  });

  /**
   * 検索は**どちらの面でも押せる**。探す対象が変わるだけで、
   * 実体の振り分けは `features/mode/find.ts` が持つ（F-VIEW-10 / F-EDIT-05）。
   *
   * **ラベルは対象を言う。** Preview では「プレビュー内を検索」、Edit では「検索」。
   */
  it('検索のラベルは、いま見ている面で変わる', () => {
    documentStore.meta = META;

    viewStore.mode = 'preview';
    expect(label(buildMenu(), 'search')).toBe('プレビュー内を検索');

    viewStore.mode = 'edit';
    expect(label(buildMenu(), 'search')).toBe('検索');
  });

  /**
   * 置換は Edit のときだけ（`app/commands.ts` の `isListed`）。
   * 読んでいる面を書き換える経路は無いので、Preview に出しても押せない項目になる。
   */
  it('置換は Edit モードのときだけ並べる', () => {
    documentStore.meta = META;

    viewStore.mode = 'preview';
    expect(ids(buildMenu())).not.toContain('replace');

    viewStore.mode = 'edit';
    expect(ids(buildMenu())).toContain('replace');
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
   * ADR-0007 論点 3。**確実に終了できる導線を 3 つ用意する**という決定のうち、
   * ウィンドウの中にある 1 つ。`✕` がトレイ格納の意味になったので、
   * ここが消えると逃げ場がトレイアイコンだけになる。
   */
  it('ファイルを開いていてもいなくても、終了できる', () => {
    expect(ids(buildMenu())).toContain('quit');

    documentStore.meta = META;
    expect(ids(buildMenu())).toContain('quit');
  });

  /**
   * 後続の Phase（M3 でコマンドパレットへの登録）が項目を足す。
   * `{#each}` のキーに使うので、重複すると描画が壊れる。
   */
  it('項目の id が重複しない', () => {
    documentStore.meta = META;
    recentStore.entries = [{ path: META.path, openedAtMs: 0 }];

    const all = ids(buildMenu());

    expect(new Set(all).size).toBe(all.length);
  });
});
