// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { measureTables, observeTables, releaseTables } from './table';

/** 本文幅と、張り出したときのプレビュー幅。実際の値は CSS が決めるので、比率だけが意味を持つ。 */
const CONTENT_WIDTH = 600;
const PANE_WIDTH = 900;

/**
 * 表 1 つを作る。`natural` は中身が必要とする幅である。
 *
 * jsdom はレイアウトを行わないため、`clientWidth` / `scrollWidth` を自分で答える。
 * `clientWidth` が `data-mx-wide` で変わるのが、CSS 側の張り出しにあたる。
 */
function addTable(container: HTMLElement, natural: number): HTMLElement {
  const table = document.createElement('div');
  table.className = 'mx-table';

  Object.defineProperties(table, {
    clientWidth: { get: () => ('mxWide' in table.dataset ? PANE_WIDTH : CONTENT_WIDTH) },
    scrollWidth: { configurable: true, get: () => Math.max(natural, table.clientWidth) },
  });

  container.append(table);
  return table;
}

let container: HTMLElement;

beforeEach(() => {
  document.body.replaceChildren();
  container = document.createElement('div');
  document.body.append(container);
});

afterEach(() => {
  releaseTables();
});

describe('表の幅の判定（features/preview/table.ts）', () => {
  it('本文幅に収まる表は、張り出さず、見出しを固定できる', () => {
    const table = addTable(container, 400);

    measureTables(container);

    expect(table.dataset['mxWide']).toBeUndefined();
    expect(table.dataset['mxFits']).toBe('');
    expect(table.dataset['mxScrolls']).toBeUndefined();
  });

  it('本文幅に収まらない表は張り出す。そこで収まれば見出しを固定できる', () => {
    const table = addTable(container, 800);

    measureTables(container);

    expect(table.dataset['mxWide']).toBe('');
    expect(table.dataset['mxFits']).toBe('');
  });

  it('張り出しても収まらない表は、横スクロールになる', () => {
    const table = addTable(container, 2000);

    measureTables(container);

    expect(table.dataset['mxWide']).toBe('');
    expect(table.dataset['mxScrolls']).toBe('');
    expect(table.dataset['mxFits']).toBeUndefined();
  });

  /** 見出しの固定と横スクロールは両立しない（`table.ts` の冒頭）。どちらか一方しか付かない。 */
  it('収まる判定とスクロール判定が同時に付かない', () => {
    const tables = [addTable(container, 400), addTable(container, 800), addTable(container, 2000)];

    measureTables(container);

    for (const table of tables) {
      expect('mxFits' in table.dataset && 'mxScrolls' in table.dataset).toBe(false);
    }
  });

  it('測り直すと、前回の結果を引きずらない', () => {
    const table = addTable(container, 2000);
    measureTables(container);
    expect(table.dataset['mxScrolls']).toBe('');

    // 中身が変わって収まるようになった場合にあたる（再描画後の測り直し）。
    Object.defineProperty(table, 'scrollWidth', { get: () => table.clientWidth });
    measureTables(container);

    expect(table.dataset['mxScrolls']).toBeUndefined();
    expect(table.dataset['mxWide']).toBeUndefined();
    expect(table.dataset['mxFits']).toBe('');
  });

  it('表が無ければ何もしない', () => {
    expect(() => {
      measureTables(container);
    }).not.toThrow();
  });
});

describe('幅の監視（N-PERF-05 / N-PERF-06）', () => {
  it('文書を閉じると監視をやめる', () => {
    const disconnect = vi.fn();
    const observe = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe = observe;
        unobserve = vi.fn();
        disconnect = disconnect;
      },
    );

    addTable(container, 400);
    observeTables(container);
    expect(observe).toHaveBeenCalledTimes(1);

    releaseTables();

    expect(disconnect).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});
