// @vitest-environment jsdom
/**
 * パースをやり直す条件（`watch-render-settings.svelte.ts`）。
 *
 * 見たいのは「描き直すべきときだけ描き直すこと」である。
 * `renderNow()` はプレビューの DOM を作り直すため、無関係な設定や同じ値での差し替えで走ると本文がその回数だけ再描画される。
 */
import { flushSync } from 'svelte';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as DocumentFeature from '@/features/document';
import { settingsStore } from '@/features/settings';
import { DEFAULT_SETTINGS, type Settings } from '@/platform';

const renderNow = vi.fn(() => Promise.resolve());

vi.mock('@/features/document', async (importOriginal) => ({
  ...((await importOriginal()) as typeof DocumentFeature),
  renderNow: () => renderNow(),
}));

const { installSoftBreakRerender } = await import('./watch-render-settings.svelte');

/** 1 項目だけ変える。設定 UI と同じく、オブジェクトごと差し替わる。 */
function change(patch: Partial<Settings>): void {
  settingsStore.values = { ...settingsStore.values, ...patch };
  flushSync();
}

beforeAll(() => {
  settingsStore.values = DEFAULT_SETTINGS;
  installSoftBreakRerender();
  flushSync();
});

beforeEach(() => {
  renderNow.mockClear();
});

describe('installSoftBreakRerender', () => {
  it('購読を始めた時点では描き直さない', () => {
    expect(renderNow).not.toHaveBeenCalled();
  });

  it('CSS だけで反映できる設定では描き直さない', () => {
    change({ 'preview.fontSize': 20 });
    expect(renderNow).not.toHaveBeenCalled();
  });

  it('同じ値での差し替え（保存の完了・設定ファイルの読み直し）では描き直さない', () => {
    change({});
    change({});
    expect(renderNow).not.toHaveBeenCalled();
  });

  it('改行の扱いが変わったら 1 回だけ描き直す', () => {
    change({ 'preview.softBreak': true });
    expect(renderNow).toHaveBeenCalledTimes(1);

    change({ 'preview.fontFamily': 'Meiryo' });
    expect(renderNow).toHaveBeenCalledTimes(1);
  });

  it('追加記法が変わったら 1 回だけ描き直す', () => {
    change({ 'markdown.subscript': true });
    expect(renderNow).toHaveBeenCalledTimes(1);
  });
});
