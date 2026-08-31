// @vitest-environment jsdom
/**
 * `Ctrl+F` / `Ctrl+H` の振り分け（F-VIEW-10 / F-EDIT-05 / 03.ux-spec/04-keybindings.md §4）。
 *
 * **見ているのは「どちらが開くか」だけ。** 検索そのもの（プレビューの `Range` 探索 /
 * Monaco の find ウィジェット）は実体を載せず、開く / 閉じるの呼び出しをモックで数える。
 * Split の判定はフォーカスに依るので、`#mx-editor` を本物の DOM として置く。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { viewStore } from '@/features/view/store.svelte';

const openEditorSearchLazily = vi.fn((_replace: boolean) => Promise.resolve());
const closeEditorSearchLazily = vi.fn(() => Promise.resolve());
const closePreview = vi.fn();
const openSearchLazily = vi.fn(() => Promise.resolve(closePreview));

vi.mock('@/features/editor/open-editor', () => ({
  openEditorSearchLazily: (replace: boolean) => openEditorSearchLazily(replace),
  closeEditorSearchLazily: () => closeEditorSearchLazily(),
}));

vi.mock('@/features/preview/open-search', () => ({
  openSearchLazily: () => openSearchLazily(),
}));

const { closePreviewFind, openFind, openReplace, resetFind } = await import('./find');

/** エディタの中の入力欄にフォーカスを置く（Monaco のテキストエリアの代わり）。 */
function focusEditor(): void {
  document.querySelector<HTMLInputElement>('#mx-editor input')?.focus();
}

beforeEach(() => {
  openEditorSearchLazily.mockClear();
  closeEditorSearchLazily.mockClear();
  openSearchLazily.mockClear();
  closePreview.mockClear();
  resetFind();
  document.body.innerHTML = '<div id="mx-preview"></div><div id="mx-editor"><input /></div>';
  viewStore.mode = 'preview';
});

describe('片面のとき', () => {
  it('Preview では本文検索が開く', async () => {
    await openFind();
    expect(openSearchLazily).toHaveBeenCalled();
    expect(openEditorSearchLazily).not.toHaveBeenCalled();
  });

  it('Edit ではエディタ検索が開く', async () => {
    viewStore.mode = 'edit';
    await openFind();
    expect(openEditorSearchLazily).toHaveBeenCalledWith(false);
    expect(openSearchLazily).not.toHaveBeenCalled();
  });

  it('Preview の Ctrl+H は何も開かない', async () => {
    await openReplace();
    expect(openEditorSearchLazily).not.toHaveBeenCalled();
    expect(openSearchLazily).not.toHaveBeenCalled();
  });
});

describe('Split ではフォーカスで決まる', () => {
  beforeEach(() => {
    viewStore.mode = 'split';
  });

  it('エディタにフォーカスがあればエディタ検索', async () => {
    focusEditor();
    await openFind();
    expect(openEditorSearchLazily).toHaveBeenCalledWith(false);
    expect(openSearchLazily).not.toHaveBeenCalled();
  });

  it('エディタの外にフォーカスがあれば本文検索', async () => {
    await openFind();
    expect(openSearchLazily).toHaveBeenCalled();
    expect(openEditorSearchLazily).not.toHaveBeenCalled();
  });

  it('置換はフォーカスに関わらずエディタ', async () => {
    await openReplace();
    expect(openEditorSearchLazily).toHaveBeenCalledWith(true);
  });
});

describe('2 つの検索を同時に開かない', () => {
  beforeEach(() => {
    viewStore.mode = 'split';
  });

  it('本文検索 → エディタ検索で、本文検索が閉じる', async () => {
    await openFind();
    focusEditor();
    await openFind();
    expect(closePreview).toHaveBeenCalled();
  });

  it('エディタ検索 → 本文検索で、エディタ検索が閉じる', async () => {
    focusEditor();
    await openFind();
    document.querySelector<HTMLElement>('#mx-editor input')?.blur();
    await openFind();
    expect(closeEditorSearchLazily).toHaveBeenCalled();
  });

  it('エディタ検索を一度も開いていなければ、閉じにいかない', async () => {
    // **`editor` チャンクを落とさないための番人。** Preview だけで読んでいる起動の
    // 初回 `Ctrl+F` でここを通ると、動的 import が走ってエディタが落ちてくる。
    await openFind();
    expect(closeEditorSearchLazily).not.toHaveBeenCalled();
  });
});

describe('Preview を離れるとき', () => {
  it('開いていた本文検索を閉じる', async () => {
    await openFind();
    closePreviewFind();
    expect(closePreview).toHaveBeenCalledTimes(1);

    // 2 回目は相手が居ない。
    closePreviewFind();
    expect(closePreview).toHaveBeenCalledTimes(1);
  });

  it('一度も開いていなければ何も起きない', () => {
    expect(() => closePreviewFind()).not.toThrow();
  });
});
