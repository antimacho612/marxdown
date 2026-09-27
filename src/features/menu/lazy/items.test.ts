// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { registerAppCommands } from '@/app/commands';
import { documentStore } from '@/features/document';
import { initWindowRole, viewStore } from '@/features/view';
import { recentStore } from '@/features/workspace';
import type { DocumentMeta } from '@/platform';

import { buildMenu, MENU_RECENT_SHOWN, type MenuAction, type MenuGroup, type MenuItem } from './items';

/**
 * 実物の表を使う。
 *
 * メニューは `CommandId` しか持たず、何を並べるかは `app/commands.ts` の `isListed` が決める。
 * ダミーに差し替えると、「id は合っているのに実体が無い」という最も起きやすい不具合を見逃す。
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

/** 親メニューに並ぶ行の id。サブメニューの中身は含めない。 */
function ids(groups: MenuGroup[]): string[] {
  return groups.flatMap((g) => g.items.map((i) => i.id));
}

function group(groups: MenuGroup[], id: string): MenuGroup | undefined {
  return groups.find((g) => g.id === id);
}

function item(groups: MenuGroup[], id: string): MenuItem | undefined {
  return groups.flatMap((g) => g.items).find((i) => i.id === id);
}

function submenu(groups: MenuGroup[], id: string): MenuAction[] | undefined {
  const found = item(groups, id);
  return found?.kind === 'submenu' ? found.items : undefined;
}

function label(groups: MenuGroup[], itemId: string): string | undefined {
  return item(groups, itemId)?.label;
}

beforeEach(() => {
  initWindowRole({ role: 'main' });
  documentStore.meta = null;
  recentStore.entries = [];
  viewStore.mode = 'preview';
  viewStore.zoom = 1;
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
    // タブを別ウィンドウへ移す操作は開いているときだけ。
    // 「最近開いたファイル」は履歴が空でも親の行を残す。
    expect(ids(groups)).toEqual(['open', 'open-folder', 'new', 'recent', 'palette', 'settings', 'quit']);
    expect(group(groups, 'view')).toBeUndefined();
    expect(group(groups, 'document')).toBeUndefined();
  });

  it('ファイルを開くと、その文書に対する操作が増える', () => {
    documentStore.meta = META;

    expect(ids(buildMenu())).toEqual([
      'open',
      'open-folder',
      'new',
      'recent',
      'save',
      'save-as',
      'export',
      'move-to-new-window',
      'mode',
      'split',
      'outline',
      'jump',
      'zoom',
      'reload',
      'search',
      'palette',
      'settings',
      'quit',
    ]);
  });

  /**
   * サテライトはタブと本文だけを持つ（F-OPEN-06 / ADR-0016）。
   * ファイルツリーもペインも無い窓に、それを開閉する項目を並べない（Principle 3）。
   */
  it('サテライトでは、ペインとファイルツリーの項目を並べない (F-OPEN-06)', () => {
    documentStore.meta = META;
    initWindowRole({ role: 'satellite' });

    const ids = new Set(buildMenu().flatMap((g) => g.items.map((i) => i.id)));

    expect(ids.has('open-folder')).toBe(false);
    expect(ids.has('outline')).toBe(false);
    // 文書に対する操作は残る。サテライトでも読み書きはできる。
    expect(ids.has('save')).toBe(true);
    expect(ids.has('move-to-new-window')).toBe(true);
  });

  /**
   * 検索はどちらの面でも押せる。探す対象が変わるだけで、実体の振り分けは `features/mode/find.ts` が持つ（F-VIEW-10 / F-EDIT-05）。
   *
   * ラベルは対象を言う。
   * Preview では「プレビュー内を検索」、Edit では「検索」。
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

  /** 履歴が空でも親の行は出す。サブメニューの中は項目ではなく 1 行の文で埋める。 */
  it('履歴が空のときは、押せない項目の代わりに文を出す', () => {
    const recent = item(buildMenu(), 'recent');

    expect(recent?.kind).toBe('submenu');
    expect(recent?.kind === 'submenu' && recent.items).toEqual([]);
    expect(recent?.kind === 'submenu' && recent.empty).toBeTruthy();
  });

  /** 書き出しは形式ごとの項目をサブメニューに収める。形式が増えても親メニューの行数は変わらない。 */
  it('書き出しの形式はサブメニューに並べる (F-VIEW-18)', () => {
    documentStore.meta = META;

    expect(submenu(buildMenu(), 'export')?.map((i) => i.id)).toEqual(['export-html', 'export-pdf']);
  });

  /** 拡大・縮小・等倍は 1 行に収め、現在値を中央に出す。 */
  it('表示倍率は現在値つきの 1 行にまとめる (F-VIEW-11)', () => {
    documentStore.meta = META;
    viewStore.zoom = 1.25;

    const zoom = item(buildMenu(), 'zoom');

    expect(zoom?.kind).toBe('stepper');
    if (zoom?.kind !== 'stepper') return;
    expect(zoom.value).toBe('125%');
    expect([zoom.decrease.id, zoom.reset.id, zoom.increase.id]).toEqual(['zoom-out', 'zoom-reset', 'zoom-in']);
    expect(zoom.atMin).toBe(false);
    expect(zoom.atMax).toBe(false);
  });

  it('表示倍率が端に達すると、その側のボタンを無効として示す', () => {
    documentStore.meta = META;

    viewStore.zoom = 0.5;
    const min = item(buildMenu(), 'zoom');
    expect(min?.kind === 'stepper' && min.atMin).toBe(true);

    viewStore.zoom = 3;
    const max = item(buildMenu(), 'zoom');
    expect(max?.kind === 'stepper' && max.atMax).toBe(true);
  });

  /** ここが伸びると、メニューが履歴の一覧という別の役割を持つことになる。 */
  it('最近開いたファイルは上限までしか並べない', () => {
    recentStore.entries = Array.from({ length: MENU_RECENT_SHOWN + 5 }, (_, i) => ({
      path: `C:\\notes\\note-${String(i)}.md`,
      openedAtMs: i,
    }));

    expect(submenu(buildMenu(), 'recent')).toHaveLength(MENU_RECENT_SHOWN);
  });

  it('最近開いたファイルは、名前とディレクトリに割って出す', () => {
    recentStore.entries = [{ path: META.path, openedAtMs: 0 }];

    const [entry] = submenu(buildMenu(), 'recent') ?? [];

    expect(entry?.label).toBe('README.md');
    expect(entry?.detail).toBe('C:\\Users\\me\\repos\\marxdown');
    // 省略されて読めなくなるので、完全なパスはツールチップに残す
    expect(entry?.title).toBe(META.path);
  });

  /**
   * ADR-0007 論点 3。確実に終了できる導線を 3 つ用意するという決定のうち、ウィンドウの中にある 1 つ。
   * `✕` はトレイ格納の意味であるため、ここが無いと終了の手段がトレイアイコンだけになる。
   */
  it('ファイルを開いていてもいなくても、終了できる', () => {
    expect(ids(buildMenu())).toContain('quit');

    documentStore.meta = META;
    expect(ids(buildMenu())).toContain('quit');
  });

  /**
   * `{#each}` のキーに使うため、重複すると描画が崩れる。
   */
  it('項目の id が重複しない', () => {
    documentStore.meta = META;
    recentStore.entries = [{ path: META.path, openedAtMs: 0 }];

    const groups = buildMenu();
    const all = [...ids(groups), ...(submenu(groups, 'recent') ?? []), ...(submenu(groups, 'export') ?? [])].map((i) =>
      typeof i === 'string' ? i : i.id,
    );

    expect(new Set(all).size).toBe(all.length);
  });
});
