// @vitest-environment jsdom
/**
 * macOS のキーの判定と表記（M10 §4.6）。
 *
 * 実機の WKWebView が送るイベントの形（`Option` で `key` が合成文字になる）を再現して確かめる。
 */
import { describe, expect, it } from 'vitest';

import { combo, split } from './macos';

function key(init: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent('keydown', init);
}

describe('combo', () => {
  it('Cmd を主修飾子にし、物理の Control を別に扱う', () => {
    expect(combo(key({ key: 'p', code: 'KeyP', metaKey: true, shiftKey: true }))).toBe('Ctrl+Shift+P');
    expect(combo(key({ key: 'Tab', code: 'Tab', ctrlKey: true }))).toBe('Control+Tab');
    expect(combo(key({ key: 'f', code: 'KeyF', ctrlKey: true, metaKey: true }))).toBe('Control+Ctrl+F');
  });

  it('Option を含むキーは物理キーで判定する', () => {
    expect(combo(key({ key: 'ƒ', code: 'KeyF', metaKey: true, altKey: true }))).toBe('Ctrl+Alt+F');
    expect(combo(key({ key: 'ø', code: 'KeyO', metaKey: true, altKey: true }))).toBe('Ctrl+Alt+O');
    expect(combo(key({ key: '¡', code: 'Digit1', metaKey: true, altKey: true }))).toBe('Ctrl+Alt+1');
  });

  it('Shift を押した角括弧を角括弧として扱う', () => {
    expect(combo(key({ key: '}', code: 'BracketRight', metaKey: true, shiftKey: true }))).toBe('Ctrl+Shift+]');
    expect(combo(key({ key: '[', code: 'BracketLeft', metaKey: true }))).toBe('Ctrl+[');
  });

  it('OS の操作に使うキーはアプリのキーとして扱わない', () => {
    expect(combo(key({ key: 'h', code: 'KeyH', metaKey: true }))).toBe('');
    expect(combo(key({ key: 'ArrowLeft', code: 'ArrowLeft', altKey: true }))).toBe('');
  });
});

describe('split', () => {
  it('修飾子を字形にし、Apple の順に並べる', () => {
    expect(split('Ctrl+Shift+P')).toEqual(['⇧', '⌘', 'P']);
    expect(split('Shift+Alt+F')).toEqual(['⌥', '⇧', 'F']);
  });

  it('付け替えたキーは macOS の割り当てで表示する', () => {
    expect(split('Ctrl+H')).toEqual(['⌥', '⌘', 'F']);
    expect(split('Alt+←')).toEqual(['⌘', '[']);
    expect(split('Ctrl+Tab')).toEqual(['⌃', 'Tab']);
  });
});
