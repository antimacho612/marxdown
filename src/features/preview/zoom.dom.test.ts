// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getPlatform, setPlatform, type Platform } from '@/platform';

import { useViewStore } from '../view/store';
import { applyZoom, formatZoom, ZOOM_MAX, ZOOM_MIN, zoomIn, zoomOut, zoomReset } from './zoom';

const original = getPlatform();

function zoomVar(): string {
  return document.documentElement.style.getPropertyValue('--mx-zoom');
}

beforeEach(() => {
  vi.useFakeTimers();
  document.documentElement.removeAttribute('style');
  useViewStore.setState({ zoom: 1 });
});

afterEach(() => {
  vi.useRealTimers();
  setPlatform(original);
});

describe('表示倍率 (F-VIEW-11)', () => {
  it('CSS 変数に書き、ストアにも映す', () => {
    applyZoom(1.25, false);
    expect(zoomVar()).toBe('1.25');
    expect(useViewStore.getState().zoom).toBe(1.25);
  });

  it('刻みを 1 つずつ動く', () => {
    applyZoom(1, false);
    expect(zoomIn()).toBe(1.1);
    expect(zoomIn()).toBe(1.25);
    expect(zoomOut()).toBe(1.1);
  });

  it('刻みの上に無い値からでも、進む方向の最も近い刻みに乗る', () => {
    applyZoom(1.2, false);
    expect(zoomIn()).toBe(1.25);

    applyZoom(1.2, false);
    expect(zoomOut()).toBe(1.1);
  });

  it('上限と下限を越えない', () => {
    applyZoom(ZOOM_MAX, false);
    expect(zoomIn()).toBe(ZOOM_MAX);

    applyZoom(ZOOM_MIN, false);
    expect(zoomOut()).toBe(ZOOM_MIN);
  });

  it('範囲外の値と NaN を丸める', () => {
    expect(applyZoom(99, false)).toBe(ZOOM_MAX);
    expect(applyZoom(0, false)).toBe(ZOOM_MIN);
    expect(applyZoom(Number.NaN, false)).toBe(1);
  });

  it('等倍に戻せる', () => {
    applyZoom(2, false);
    expect(zoomReset()).toBe(1);
  });

  it('連打しても保存は 1 回にまとまる', () => {
    const setZoom = vi.fn().mockResolvedValue(undefined);
    setPlatform({ ...original, setZoom } as Platform);

    applyZoom(1, false);
    zoomIn();
    zoomIn();
    zoomIn();
    expect(setZoom).not.toHaveBeenCalled();

    vi.runAllTimers();

    expect(setZoom).toHaveBeenCalledOnce();
    expect(setZoom).toHaveBeenCalledWith(1.5);
  });

  it('起動時の復元は保存し直さない', () => {
    const setZoom = vi.fn().mockResolvedValue(undefined);
    setPlatform({ ...original, setZoom } as Platform);

    applyZoom(1.5, false);
    vi.runAllTimers();

    expect(setZoom).not.toHaveBeenCalled();
  });

  it('パーセント表示にする', () => {
    expect(formatZoom(1)).toBe('100%');
    expect(formatZoom(1.25)).toBe('125%');
    expect(formatZoom(0.67)).toBe('67%');
  });
});
