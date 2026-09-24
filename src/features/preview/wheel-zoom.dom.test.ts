// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { viewStore } from '../view/store.svelte';
import { installWheelZoom } from './wheel-zoom';
import { applyZoom } from './zoom';

let uninstall: (() => void) | null = null;

/** 既定は 1 ノッチぶん（`deltaY` 100）。`deltaMode` は既定でピクセル単位である。 */
function wheel(deltaY: number, init: WheelEventInit = {}): WheelEvent {
  const event = new WheelEvent('wheel', { deltaY, ctrlKey: true, cancelable: true, ...init });
  globalThis.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  vi.useFakeTimers();
  document.documentElement.removeAttribute('style');
  applyZoom(1, false);
  uninstall = installWheelZoom();
});

afterEach(() => {
  uninstall?.();
  uninstall = null;
  vi.useRealTimers();
});

describe('Ctrl + ホイールの表示倍率 (F-VIEW-11)', () => {
  it('上方向で拡大し、下方向で縮小する', () => {
    wheel(-100);
    expect(viewStore.zoom).toBe(1.1);

    wheel(100);
    expect(viewStore.zoom).toBe(1);
  });

  it('Ctrl が押されていなければ何もせず、既定動作も止めない', () => {
    const event = wheel(-100, { ctrlKey: false });
    expect(viewStore.zoom).toBe(1);
    expect(event.defaultPrevented).toBe(false);
  });

  it('WebView 既定のページズームを止める', () => {
    expect(wheel(-100).defaultPrevented).toBe(true);
  });

  it('1 ノッチに満たない入力は、蓄積して 1 段階になる', () => {
    wheel(-40);
    wheel(-40);
    expect(viewStore.zoom).toBe(1);

    wheel(-40);
    expect(viewStore.zoom).toBe(1.1);
  });

  it('向きが変わったら持ち越しを捨てる', () => {
    wheel(-80);
    expect(viewStore.zoom).toBe(1);

    // 持ち越しが残っていると、この 1 ノッチは打ち消しに使われて無反応になる。
    wheel(100);
    expect(viewStore.zoom).toBe(0.9);
  });

  it('1 イベントに複数段階ぶん乗っていれば、その回数だけ動く', () => {
    wheel(-300);
    expect(viewStore.zoom).toBe(1.5);
  });

  it('行単位で届く値も段階に変換する', () => {
    wheel(-7, { deltaMode: WheelEvent.DOM_DELTA_LINE });
    expect(viewStore.zoom).toBe(1.1);
  });

  it('ページ単位で届く値も段階に変換する', () => {
    wheel(-1, { deltaMode: WheelEvent.DOM_DELTA_PAGE });
    expect(viewStore.zoom).toBe(1.75);
  });

  it('解除すると反応しなくなる', () => {
    uninstall?.();
    uninstall = null;

    wheel(-100);
    expect(viewStore.zoom).toBe(1);
  });

  /**
   * Monaco のスクロール可能要素は `scrollbar.alwaysConsumeMouseWheel`（既定 true）によりホイールイベントを
   * バブリング前に `stopPropagation()` する（GitHub Issue #157）。
   * 捕捉フェーズで登録していれば、その `stopPropagation()` より先に本関数が実行されるため影響を受けない。
   */
  it('子要素がバブリングを止めても反応する（エディター上のホイール）', () => {
    const editorHost = document.createElement('div');
    editorHost.addEventListener('wheel', (event) => event.stopPropagation(), { passive: true });
    document.body.append(editorHost);

    const event = new WheelEvent('wheel', { deltaY: -100, ctrlKey: true, cancelable: true });
    editorHost.dispatchEvent(event);

    expect(viewStore.zoom).toBe(1.1);
    expect(event.defaultPrevented).toBe(true);

    editorHost.remove();
  });
});
