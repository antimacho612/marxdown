// @vitest-environment jsdom
/**
 * プレビュー上のタスクリスト操作の受け口（F-VIEW-01 / OQ-05）。
 *
 * ここで見張るのは「どの行を反転しようとしたか」と「押した結果が見た目に出るか」である。
 * テキストをどう書き換えるかは `features/document/task.ts` の担当で、そちらは別に検証している。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { installTaskHandler } from './task';

const toggle = vi.fn<(line: number) => boolean | null>();

/** `markdown/plugins/task-list.ts` が出す形の DOM を組む。 */
function preview(...items: { line: number; checked: boolean }[]): HTMLElement {
  const container = document.createElement('div');
  const list = document.createElement('ul');

  for (const item of items) {
    const li = document.createElement('li');
    li.className = 'task-list-item';
    li.dataset['line'] = String(item.line);

    const box = document.createElement('span');
    box.className = 'mx-task';
    box.setAttribute('role', 'checkbox');
    box.setAttribute('tabindex', '0');
    box.setAttribute('aria-checked', String(item.checked));

    li.append(box);
    list.append(li);
  }

  container.append(list);
  document.body.append(container);
  return container;
}

function boxes(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>('.mx-task')];
}

function click(element: HTMLElement): void {
  element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

beforeEach(() => {
  document.body.replaceChildren();
  toggle.mockReset();
});

describe('クリック', () => {
  it('祖先の data-line を行番号として渡す', () => {
    toggle.mockReturnValue(true);
    const container = preview({ line: 3, checked: false });
    installTaskHandler(container, { toggle });

    click(boxes(container)[0] as HTMLElement);

    expect(toggle).toHaveBeenCalledWith(3);
  });

  it('反転した結果を aria-checked に映す', () => {
    toggle.mockReturnValue(true);
    const container = preview({ line: 0, checked: false });
    installTaskHandler(container, { toggle });

    const box = boxes(container)[0] as HTMLElement;
    click(box);

    expect(box.getAttribute('aria-checked')).toBe('true');
  });

  it('反転されなかったときは見た目を変えない', () => {
    // 生 HTML で書かれた `<span class="mx-task">` がこれに当たる。
    // その行はタスクリストの形をしていないため、`document` 側が null を返す。
    toggle.mockReturnValue(null);
    const container = preview({ line: 0, checked: false });
    installTaskHandler(container, { toggle });

    const box = boxes(container)[0] as HTMLElement;
    click(box);

    expect(box.getAttribute('aria-checked')).toBe('false');
  });

  it('チェックボックス以外のクリックには反応しない', () => {
    const container = preview({ line: 0, checked: false });
    installTaskHandler(container, { toggle });

    container.querySelector('li')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(toggle).not.toHaveBeenCalled();
  });

  it('data-line を持つ祖先が無ければ何もしない', () => {
    const container = document.createElement('div');
    const box = document.createElement('span');
    box.className = 'mx-task';
    container.append(box);
    document.body.append(container);

    installTaskHandler(container, { toggle });
    click(box);

    expect(toggle).not.toHaveBeenCalled();
  });
});

describe('キーボード', () => {
  it('Space で反転する', () => {
    toggle.mockReturnValue(true);
    const container = preview({ line: 1, checked: false });
    installTaskHandler(container, { toggle });

    boxes(container)[0]?.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));

    expect(toggle).toHaveBeenCalledWith(1);
  });

  it('Enter でも反転する', () => {
    toggle.mockReturnValue(true);
    const container = preview({ line: 1, checked: false });
    installTaskHandler(container, { toggle });

    boxes(container)[0]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));

    expect(toggle).toHaveBeenCalledWith(1);
  });

  it('Space の既定の動作（スクロール）を奪うのはチェックボックスの上だけ', () => {
    const container = preview({ line: 0, checked: false });
    installTaskHandler(container, { toggle });

    const onList = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    container.querySelector('li')?.dispatchEvent(onList);

    expect(onList.defaultPrevented).toBe(false);
    expect(toggle).not.toHaveBeenCalled();
  });
});

describe('解除', () => {
  it('解除するとクリックを拾わなくなる', () => {
    const container = preview({ line: 0, checked: false });
    const uninstall = installTaskHandler(container, { toggle });

    uninstall();
    click(boxes(container)[0] as HTMLElement);

    expect(toggle).not.toHaveBeenCalled();
  });
});
