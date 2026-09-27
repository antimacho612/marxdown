// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetShortcuts } from '@/lib/shortcuts';

import { closeSearch, isOpen, openSearch } from './search';

let container: HTMLElement;

/** jsdom には CSS Custom Highlight API が無い。登録内容だけ観測できるようにする。 */
const highlights = new Map<string, unknown[]>();

function panel(): HTMLElement {
  return document.querySelector('.mx-search') as HTMLElement;
}

function input(): HTMLInputElement {
  return document.querySelector('.mx-search__input') as HTMLInputElement;
}

function counter(): string {
  return document.querySelector('.mx-search__counter')?.textContent ?? '';
}

function type(value: string): void {
  input().value = value;
  input().dispatchEvent(new Event('input', { bubbles: true }));
}

function press(key: string, shiftKey = false): void {
  input().dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true }));
}

beforeEach(() => {
  highlights.clear();
  vi.stubGlobal(
    'Highlight',
    class {
      ranges: unknown[];
      constructor(...ranges: unknown[]) {
        this.ranges = ranges;
      }
    },
  );
  vi.stubGlobal('CSS', {
    highlights: {
      set: (name: string, h: { ranges: unknown[] }) => highlights.set(name, h.ranges),
      delete: (name: string) => highlights.delete(name),
    },
  });

  document.body.innerHTML = '<div id="mx-preview"></div>';
  container = document.querySelector('#mx-preview') as HTMLElement;
  // Range.getBoundingClientRect / scrollIntoView は jsdom に無い
  Range.prototype.getBoundingClientRect = () => new DOMRect(0, 0, 0, 0);
});

afterEach(() => {
  closeSearch();
  resetShortcuts();
  vi.unstubAllGlobals();
});

describe('プレビュー内検索 (F-VIEW-10)', () => {
  it('開くとパネルが出て、入力欄に焦点が当たる', () => {
    openSearch(container);

    expect(panel()).not.toBeNull();
    expect(document.activeElement).toBe(input());
    expect(isOpen()).toBe(true);
  });

  it('一致件数と現在位置を出す', () => {
    container.innerHTML = '<p>foo bar foo baz foo</p>';
    openSearch(container);

    type('foo');

    expect(counter()).toBe('1 / 3');
  });

  it('大文字小文字を区別しない', () => {
    container.innerHTML = '<p>Foo FOO foo</p>';
    openSearch(container);

    type('foo');

    expect(counter()).toBe('1 / 3');
  });

  it('要素をまたぐ一致も拾う', () => {
    // `<em>` で割れていても、本文としては 1 つの語
    container.innerHTML = '<p>Mar<em>xd</em>own</p>';
    openSearch(container);

    type('marxdown');

    expect(counter()).toBe('1 / 1');
  });

  it('日本語も探せる', () => {
    container.innerHTML = '<p>速く開く Markdown ビューア。速く読む。</p>';
    openSearch(container);

    type('速く');

    expect(counter()).toBe('1 / 2');
  });

  it('見つからないことを文字と印の両方で伝える', () => {
    container.innerHTML = '<p>foo</p>';
    openSearch(container);

    type('見つからない語');

    expect(counter()).toBe('一致なし');
    expect(panel().dataset['mxEmpty']).toBe('true');
  });

  it('空の入力では何も出さない', () => {
    container.innerHTML = '<p>foo</p>';
    openSearch(container);

    type('foo');
    type('');

    expect(counter()).toBe('');
    expect(panel().dataset['mxEmpty']).toBe('false');
  });

  it('現在の一致だけを別のハイライトに分ける', () => {
    container.innerHTML = '<p>foo foo foo</p>';
    openSearch(container);

    type('foo');

    expect(highlights.get('mx-search-current')).toHaveLength(1);
    expect(highlights.get('mx-search')).toHaveLength(2);
  });

  it('Enter で次へ、Shift+Enter で前へ回る', () => {
    container.innerHTML = '<p>foo foo foo</p>';
    openSearch(container);
    type('foo');

    press('Enter');
    expect(counter()).toBe('2 / 3');

    press('Enter');
    expect(counter()).toBe('3 / 3');

    // 末尾の次は先頭へ回る
    press('Enter');
    expect(counter()).toBe('1 / 3');

    press('Enter', true);
    expect(counter()).toBe('3 / 3');
  });

  it('F3 / Shift+F3 でも移動できる', () => {
    container.innerHTML = '<p>foo foo</p>';
    openSearch(container);
    type('foo');

    globalThis.dispatchEvent(new KeyboardEvent('keydown', { key: 'F3', bubbles: true }));
    expect(counter()).toBe('2 / 2');
  });

  it('Escape で閉じ、ハイライトを残さない', () => {
    container.innerHTML = '<p>foo</p>';
    openSearch(container);
    type('foo');

    press('Escape');
    globalThis.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(isOpen()).toBe(false);
    expect(panel()).toBeNull();
    expect(highlights.size).toBe(0);
  });

  it('閉じたらキーバインドも外す（使っていない機能のキーを残さない）', () => {
    container.innerHTML = '<p>foo</p>';
    openSearch(container);
    closeSearch();

    const event = new KeyboardEvent('keydown', { key: 'F3', bubbles: true, cancelable: true });
    globalThis.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });

  it('開いているときにもう一度開くと、入力を選び直す', () => {
    openSearch(container);
    type('foo');
    const first = input();

    openSearch(container);

    expect(input()).toBe(first);
    expect(document.querySelectorAll('.mx-search')).toHaveLength(1);
  });

  it('検索欄そのものは検索対象にしない', () => {
    container.innerHTML = '<p>検索</p>';
    openSearch(container);

    // プレースホルダにも「検索」という語がある
    type('検索');

    expect(counter()).toBe('1 / 1');
  });
});
