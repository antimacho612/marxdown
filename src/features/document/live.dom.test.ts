// @vitest-environment jsdom
/**
 * Split の再描画でスクロール位置を保つこと（F-MODE-03 / #148）。
 *
 * 段階的描画（02.architecture/06-markdown-rendering-pipeline.md §4）では、最初のチャンクだけが同期的に入る。
 * その時点では scrollHeight が足りず、保持しておいた位置を代入しても上限で切り詰められる。
 * 長い文書ほど差が大きく、打鍵のたびにプレビューが先頭付近へ戻っていた。
 *
 * jsdom はレイアウトを持たないため、切り詰めは自前で再現する（`installScrollClamp`）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { viewStore } from '@/features/view';
import type { ParseResult } from '@/markdown/protocol';
import type { DocumentMeta } from '@/platform';

import { documentStore } from './store.svelte';

const CHUNKS = 5;
/** 1 チャンクぶんの高さ。実際の値に意味は無く、切り詰めが起きる関係だけを作る。 */
const CHUNK_HEIGHT = 200;
const VIEWPORT_HEIGHT = 100;

function parsed(): ParseResult {
  return {
    id: 1,
    chunks: Array.from({ length: CHUNKS }, (_, index) => `<p data-line="${index}">段落 ${index}</p>`),
    outline: [],
    frontMatter: null,
    parseMs: 0.5,
    textStats: { chars: 1, words: 1, readingMinutes: 1 },
  };
}

vi.mock('./open', () => ({
  getParser: () => ({ parse: () => Promise.resolve(parsed()), dispose: () => {} }),
  getParseOptions: () => ({ breaks: false, syntax: [] }),
}));

const { renderNow, resetLiveRender } = await import('./live');

const META: DocumentMeta = {
  path: 'C:/notes/a.md',
  eol: 'lf',
  bom: false,
  encoding: 'utf8',
  mtimeMs: 1,
  size: 1,
  readonly: false,
};

/**
 * `scrollTop` の代入を、いま DOM に入っている段落の数で切り詰める。
 * ブラウザが scrollHeight に対して行っていることを、チャンクの投入に合わせて再現する。
 */
function installScrollClamp(container: HTMLElement): void {
  let value = 0;
  Object.defineProperty(container, 'scrollTop', {
    configurable: true,
    get: () => value,
    set: (next: number) => {
      const max = Math.max(0, container.querySelectorAll('p').length * CHUNK_HEIGHT - VIEWPORT_HEIGHT);
      value = Math.max(0, Math.min(next, max));
    },
  });
}

/**
 * 残りのチャンクを投入する idle を回す。
 *
 * jsdom に `requestIdleCallback` は無く、`lib/idle.ts` は `setTimeout` で代替する。
 * その締切は `didTimeout` が真であるため、残りは 1 回で全部入る。
 */
async function flushIdle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  // 投入し終わってから走る当て直しの分。
  await new Promise((resolve) => setTimeout(resolve, 0));
}

let container: HTMLElement;

beforeEach(async () => {
  resetLiveRender();
  document.body.innerHTML = '<div id="mx-preview"></div>';
  const found = document.querySelector<HTMLElement>('#mx-preview');
  if (!found) throw new Error('#mx-preview が無い');
  container = found;
  installScrollClamp(container);

  documentStore.meta = { ...META };
  viewStore.mode = 'split';

  // 打鍵の前の状態。全チャンクが入っており、その高さぶんスクロールできる。
  await renderNow();
  await flushIdle();
});

describe('再描画とスクロール位置 (#148)', () => {
  it('段階的描画で切り詰められた位置を、全チャンクが入った後に当て直す', async () => {
    container.scrollTop = 700;
    expect(container.scrollTop).toBe(700);

    await renderNow();
    // 最初のチャンクしか入っていない時点では上限で切り詰められる。
    expect(container.scrollTop).toBe(CHUNK_HEIGHT - VIEWPORT_HEIGHT);

    await flushIdle();
    expect(container.scrollTop).toBe(700);
  });

  it('待っている間に利用者がプレビューを動かしていたら、当て直さない', async () => {
    container.scrollTop = 700;
    await renderNow();

    container.scrollTop = 50;
    await flushIdle();

    expect(container.scrollTop).toBe(50);
  });

  it('切り詰められていなければ、そのままにする', async () => {
    container.scrollTop = 50;

    await renderNow();
    expect(container.scrollTop).toBe(50);

    await flushIdle();
    expect(container.scrollTop).toBe(50);
  });
});
