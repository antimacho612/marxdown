// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { registerAppCommands } from '@/app/commands';
import { documentStore } from '@/features/document/store.svelte';
import { viewStore } from '@/features/view/store.svelte';
import { recentStore } from '@/features/workspace/recent.svelte';
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

    // 「設定」と「終了」は文書に依存しないので、ここでも押せる。
    expect(ids(groups)).toEqual(['open', 'settings', 'quit']);
    expect(group(groups, 'document')).toBeUndefined();
    expect(group(groups, 'zoom')).toBeUndefined();
  });

  it('ファイルを開くと、その文書に対する操作が増える', () => {
    documentStore.meta = META;

    expect(ids(buildMenu())).toEqual([
      'open',
      'save',
      'save-as',
      'mode',
      'reload',
      'search',
      'outline',
      'jump',
      'zoom-in',
      'zoom-out',
      'zoom-reset',
      'settings',
      'quit',
    ]);
  });

  /**
   * プレビュー内検索は **Preview を見ているときだけ**（`app/commands.ts`）。
   *
   * Edit ではエディタ側の検索（F-EDIT-05 / Phase 3）が受け持つので、
   * ここに残っていると「押しても見えていない面を探す」項目になる。
   */
  it('Edit モードではプレビュー内検索を並べない', () => {
    documentStore.meta = META;
    viewStore.mode = 'edit';

    expect(ids(buildMenu())).not.toContain('search');
    expect(ids(buildMenu())).toContain('mode');
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
