// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { bindKeys, resetShortcuts } from './shortcuts';

afterEach(() => {
  resetShortcuts();
  document.body.replaceChildren();
});

function press(init: KeyboardEventInit & { key: string }, target: EventTarget = document.body) {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

describe('bindKeys', () => {
  it('修飾子つきのキーで発火し、既定動作を止める', () => {
    const run = vi.fn();
    bindKeys([{ key: 'Ctrl+O', run }]);

    const event = press({ key: 'o', ctrlKey: true });

    expect(run).toHaveBeenCalledOnce();
    // Ctrl+= / Ctrl+F は WebView 自身の機能に割り当たっている。止めないと二重にかかる。
    expect(event.defaultPrevented).toBe(true);
  });

  it('修飾子が足りなければ発火しない', () => {
    const run = vi.fn();
    bindKeys([{ key: 'Ctrl+O', run }]);

    press({ key: 'o' });

    expect(run).not.toHaveBeenCalled();
  });

  it('大文字小文字を区別しない', () => {
    const run = vi.fn();
    bindKeys([{ key: 'Ctrl+Shift+P', run }]);

    press({ key: 'P', ctrlKey: true, shiftKey: true });

    expect(run).toHaveBeenCalledOnce();
  });

  it('Ctrl+= は Shift の有無と + 表記の両方を受ける', () => {
    const run = vi.fn();
    bindKeys([{ key: 'Ctrl+=', run }]);

    press({ key: '=', ctrlKey: true });
    press({ key: '+', ctrlKey: true, shiftKey: true });

    expect(run).toHaveBeenCalledTimes(2);
  });

  it('入力欄にフォーカスがあっても発火する', () => {
    const run = vi.fn();
    bindKeys([{ key: 'Ctrl+O', run }]);

    const input = document.createElement('input');
    document.body.append(input);
    press({ key: 'o', ctrlKey: true }, input);

    expect(run).toHaveBeenCalledOnce();
  });

  it('CodeMirror の編集面（contenteditable）でも発火する', () => {
    // ここが発火しないと、Edit モードで `Ctrl+S` も倍率も動作しなくなる。
    // エディターと取り合うキーは `features/editor/lazy/keymap.ts` の側で外してある。
    const run = vi.fn();
    bindKeys([{ key: 'Ctrl+S', run }]);

    const editor = document.createElement('div');
    editor.contentEditable = 'true';
    // jsdom は contentEditable から isContentEditable を導出しない
    Object.defineProperty(editor, 'isContentEditable', { value: true });
    document.body.append(editor);
    press({ key: 's', ctrlKey: true }, editor);

    expect(run).toHaveBeenCalledOnce();
  });

  it('IME 変換中のキーは無視する', () => {
    const run = vi.fn();
    bindKeys([{ key: 'Ctrl+O', run }]);

    press({ key: 'o', ctrlKey: true, isComposing: true });

    expect(run).not.toHaveBeenCalled();
  });

  it('後から登録したバインドが先に試される', () => {
    const order: string[] = [];
    bindKeys([{ key: 'Ctrl+O', run: () => void order.push('first') }]);
    bindKeys([{ key: 'Ctrl+O', run: () => void order.push('second') }]);

    press({ key: 'o', ctrlKey: true });

    expect(order).toEqual(['second']);
  });

  it('false を返したバインドは 1 つ前へ処理を渡す', () => {
    const order: string[] = [];
    bindKeys([{ key: 'Ctrl+O', run: () => void order.push('first') }]);
    bindKeys([
      {
        key: 'Ctrl+O',
        run: () => {
          order.push('second');
          return false;
        },
      },
    ]);

    press({ key: 'o', ctrlKey: true });

    expect(order).toEqual(['second', 'first']);
  });

  it('解除すると発火しなくなる', () => {
    const run = vi.fn();
    const dispose = bindKeys([{ key: 'Ctrl+O', run }]);

    dispose();
    press({ key: 'o', ctrlKey: true });

    expect(run).not.toHaveBeenCalled();
  });
});
