// @vitest-environment jsdom
/**
 * 改行コードの変換（F-EDIT-14）。
 *
 * 見たいのは、ダーティの源が 2 つあることである。
 * 本文と改行コードは別々に変わるため、1 つの boolean に統合すると打鍵して Undo で戻しただけで変換の指定が通知なく破棄される（`dirty.ts` の `refreshDirty`）。
 * 保存すると変換されないのに未保存の印だけが消えるため、画面からは気づけない。
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { setPlatform, type DocumentMeta, type Platform } from '@/platform';

import { markClean, setDirty } from './dirty';
import { effectiveEol, isEolChanged, nextEol, toggleEol } from './eol';
import { documentStore } from './store.svelte';

const META: DocumentMeta = {
  path: 'C:/notes/a.md',
  eol: 'lf',
  bom: false,
  encoding: 'utf8',
  mtimeMs: 1000,
  size: 10,
  readonly: false,
};

beforeEach(() => {
  setPlatform({ kind: 'web', setDirty: () => Promise.resolve() } as unknown as Platform);
  documentStore.meta = { ...META };
  documentStore.eolOverride = null;
  documentStore.isDirty = false;
  setDirty(false);
});

describe('EOL の変換', () => {
  it('押すと行き先へ変わり、未保存の変更になる', () => {
    expect(effectiveEol()).toBe('lf');
    expect(nextEol()).toBe('crlf');

    toggleEol();

    expect(effectiveEol()).toBe('crlf');
    expect(documentStore.isDirty).toBe(true);
    // ディスク上の状態は変えない。
    // `meta` は読み込んだときのままである。
    expect(documentStore.meta?.eol).toBe('lf');
  });

  it('元に戻すと、未保存の変更でもなくなる', () => {
    toggleEol();
    toggleEol();

    expect(effectiveEol()).toBe('lf');
    expect(isEolChanged()).toBe(false);
    expect(documentStore.isDirty).toBe(false);
  });

  it('打鍵して Undo で戻しても、変換の希望は残る', () => {
    toggleEol();

    // エディターが 1 打鍵ごとに呼ぶ経路（`features/editor/lazy/editor.ts`）。
    setDirty(true);
    setDirty(false); // Undo で基準まで戻った

    expect(isEolChanged()).toBe(true);
    expect(documentStore.isDirty).toBe(true);
  });

  it('本文だけがダーティなら、EOL は関係しない', () => {
    setDirty(true);
    expect(documentStore.isDirty).toBe(true);

    setDirty(false);
    expect(documentStore.isDirty).toBe(false);
  });

  it('ディスクと一致したら希望も落とす', () => {
    toggleEol();
    markClean();

    expect(isEolChanged()).toBe(false);
    expect(documentStore.isDirty).toBe(false);
  });

  it('何も開いていなければ何もしない', () => {
    documentStore.meta = null;

    expect(effectiveEol()).toBeNull();
    expect(nextEol()).toBeNull();

    toggleEol();

    expect(documentStore.eolOverride).toBeNull();
    expect(documentStore.isDirty).toBe(false);
  });
});
