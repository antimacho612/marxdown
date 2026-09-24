// @vitest-environment jsdom
/**
 * Split の再描画でプレビューを動かさないこと（F-MODE-03 / #148 / #159）。
 *
 * 作り直す方式では、段階的描画（02.architecture/06-markdown-rendering-pipeline.md §4）の途中で scrollHeight が足りず、スクロール位置が切り詰められていた。
 * 長い文書ほど差が大きく、打鍵のたびにプレビューが先頭付近へ戻っていた。
 *
 * jsdom はレイアウトを持たないため、切り詰めは自前で再現する（`installScrollClamp`）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { viewStore } from '@/features/view';
import type { ParseResult } from '@/markdown/protocol';
import type { DocumentMeta } from '@/platform';

import { documentStore } from './store.svelte';

const BLOCKS = 5;
/** 1 段落ぶんの高さ。実際の値に意味は無く、切り詰めが起きる関係だけを作る。 */
const BLOCK_HEIGHT = 200;
const VIEWPORT_HEIGHT = 100;

/** 次のパースで返す段落の本文。 */
let texts: string[] = [];

function parsed(): ParseResult {
  const blocks = texts.map((text, index) => `<p data-line="${index * 2}">${text}</p>\n`);
  return {
    id: 1,
    // 段階的描画が起きるように、1 段落ずつのチャンクにする。
    chunks: blocks,
    blocks,
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
const { paint } = await import('@/features/preview');

const META: DocumentMeta = {
  path: 'C:/notes/a.md',
  eol: 'lf',
  bom: false,
  encoding: 'utf8',
  mtimeMs: 1,
  size: 1,
  readonly: false,
};

/** これまでに `scrollTop` が取った値。一度でも切り詰められたかを見る。 */
let history: number[] = [];

/**
 * `scrollTop` の代入を、いま DOM に入っている段落の数で切り詰める。
 * ブラウザが scrollHeight に対して行っていることを再現する。
 */
function installScrollClamp(container: HTMLElement): void {
  let value = 0;
  Object.defineProperty(container, 'scrollTop', {
    configurable: true,
    get: () => value,
    set: (next: number) => {
      const max = Math.max(0, container.querySelectorAll('p').length * BLOCK_HEIGHT - VIEWPORT_HEIGHT);
      value = Math.max(0, Math.min(next, max));
      history.push(value);
    },
  });
}

/** 残りのチャンクを投入する idle を回す（jsdom では `lib/idle.ts` の `setTimeout` による代替が動く）。 */
async function flushIdle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function paragraphs(): Element[] {
  return [...container.querySelectorAll('p')];
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

  // ファイルを開いた直後の状態。`open.ts` と同じく段階的描画で全段落が入っている。
  texts = Array.from({ length: BLOCKS }, (_, index) => `段落 ${index}`);
  const initial = parsed();
  await paint(container, initial.chunks, initial.frontMatter, initial.blocks).done;
  container.scrollTop = 700;
  history = [];
});

describe('再描画とスクロール位置 (#148 / #159)', () => {
  it('文書の長さが変わらない入力では、スクロール位置が一度も変わらない', async () => {
    texts[3] = '段落 3 を編集';

    await renderNow();
    await flushIdle();

    expect(container.scrollTop).toBe(700);
    expect(history.every((value) => value === 700)).toBe(true);
    expect(paragraphs()[3]?.textContent).toBe('段落 3 を編集');
  });

  it('変わっていない段落の要素は作り直さない', async () => {
    const before = paragraphs();
    texts[3] = '段落 3 を編集';

    await renderNow();

    const after = paragraphs();
    expect(after.filter((p, index) => p === before[index])).toHaveLength(BLOCKS - 1);
    expect(after[3]).not.toBe(before[3]);
  });

  it('段落が増えても、表示している位置より上の要素は残る', async () => {
    const before = paragraphs();
    texts.push('段落 5');

    await renderNow();

    expect(container.scrollTop).toBe(700);
    expect(paragraphs().slice(0, BLOCKS)).toEqual(before);
  });
});
