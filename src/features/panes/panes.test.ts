import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { viewStore } from '@/features/view/store.svelte';
import {
  DEFAULT_PANES,
  DEFAULT_SETTINGS,
  getPlatform,
  NO_CUSTOM_CSS,
  setPlatform,
  type Bootstrap,
  type Panes,
  type Platform,
} from '@/platform';

import {
  clampPaneWidth,
  initPanes,
  PANE_WIDTH_DEFAULT,
  PANE_WIDTH_MAX,
  PANE_WIDTH_MIN,
  setRightPaneWidth,
  toggleRightPane,
} from './panes';

const original = getPlatform();

let setPanes: ReturnType<typeof vi.fn>;

function bootstrapWith(panes: Panes): Bootstrap {
  return {
    version: 1,
    document: null,
    documentError: null,
    mode: null,
    spike: { parse: 'worker' },
    trace: null,
    pendingPaths: [],
    unknownArgs: [],
    recent: [],
    zoom: 1,
    panes,
    settings: DEFAULT_SETTINGS,
    settingsError: null,
    customCss: NO_CUSTOM_CSS,
  };
}

beforeEach(() => {
  setPanes = vi.fn(() => Promise.resolve());
  setPlatform({ ...original, setPanes } as Platform);
  viewStore.panes = { left: { ...DEFAULT_PANES.left }, right: { ...DEFAULT_PANES.right } };
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  setPlatform(original);
});

describe('ペインの開閉と幅 (03.ux-spec.md §7.3)', () => {
  /**
   * §7.3 の引用ブロック。F-NAV-04 の「既定は非表示」は**初回起動の話**であり、
   * 一度開いた人がそれを維持できることと両立する。
   */
  it('記録が無ければ閉じた状態で出る', () => {
    initPanes(null);

    expect(viewStore.panes.right.open).toBe(false);
    expect(viewStore.panes.right.width).toBe(PANE_WIDTH_DEFAULT);
  });

  it('前回開いていたペインは開いた状態で出る', () => {
    initPanes(bootstrapWith({ left: { open: false, width: 240 }, right: { open: true, width: 320 } }));

    expect(viewStore.panes.right.open).toBe(true);
    expect(viewStore.panes.right.width).toBe(320);
  });

  it('幅は左右で別々に憶える', () => {
    initPanes(bootstrapWith({ left: { open: false, width: 300 }, right: { open: true, width: 200 } }));

    expect(viewStore.panes.left.width).toBe(300);
    expect(viewStore.panes.right.width).toBe(200);
  });

  it('範囲外の幅は丸める（手で書いた state.json / 解像度違いの環境）', () => {
    expect(clampPaneWidth(10)).toBe(PANE_WIDTH_MIN);
    expect(clampPaneWidth(99_999)).toBe(PANE_WIDTH_MAX);
    expect(clampPaneWidth(Number.NaN)).toBe(PANE_WIDTH_DEFAULT);
  });

  it('復元した値を保存し返さない（起動しただけで state.json を書かない）', () => {
    initPanes(bootstrapWith({ left: { open: false, width: 240 }, right: { open: true, width: 320 } }));
    vi.runAllTimers();

    expect(setPanes).not.toHaveBeenCalled();
  });
});

describe('ライトペインのトグル (Ctrl+Alt+B / OQ-24)', () => {
  it('開閉が反転し、左右まとめて永続化される', () => {
    toggleRightPane();
    expect(viewStore.panes.right.open).toBe(true);

    vi.runAllTimers();

    expect(setPanes).toHaveBeenCalledTimes(1);
    expect(setPanes.mock.calls[0]?.[0]).toEqual({
      left: { open: false, width: PANE_WIDTH_DEFAULT },
      right: { open: true, width: PANE_WIDTH_DEFAULT },
    });
  });

  it('保存はデバウンスされ、タイマーは 1 本しか走らない (05.performance-budget.md §4.5)', () => {
    setRightPaneWidth(300);
    setRightPaneWidth(320);
    setRightPaneWidth(340);

    expect(vi.getTimerCount()).toBe(1);

    vi.runAllTimers();

    expect(setPanes).toHaveBeenCalledTimes(1);
    expect(setPanes.mock.calls[0]?.[0].right.width).toBe(340);
  });

  it('ドラッグ中は保存しない（離した時点で 1 回だけ書く）', () => {
    setRightPaneWidth(300, false);
    setRightPaneWidth(310, false);
    vi.runAllTimers();

    expect(setPanes).not.toHaveBeenCalled();
    expect(viewStore.panes.right.width).toBe(310);

    setRightPaneWidth(310);
    vi.runAllTimers();

    expect(setPanes).toHaveBeenCalledTimes(1);
  });
});
