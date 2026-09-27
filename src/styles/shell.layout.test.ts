/**
 * 本文の面に重ねる要素の置き場所を検証する。
 *
 * `grid-area: main` は Preview / Edit でしか解決しない。
 * Split の `grid-template-areas` に `main` は無く、解決できない要素は自動配置になって暗黙の行と列を作る。
 * その結果、エディターとプレビューの列が 121px まで縮み、通知バーはステータスバーの外へ出る。
 *
 * jsdom は grid のレイアウトを計算しないため、配置そのものは検査できない。
 * 代わりに「どの規則で置いているか」を突き合わせる（`features/document/store.test.ts` と同じ考え方）。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

function read(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
}

const SHELL = read('./shell.css');

/** 本文の面に重ねるもの。どのモードでも本文の上に載る必要がある。 */
const OVERLAYS = [
  ['通知バー', '../app/NoticeBar.svelte'],
  ['Welcome', '../features/workspace/Welcome.svelte'],
] as const;

describe('本文の面に重ねる要素の配置', () => {
  it('shell.css が置き場所を 1 か所で決めている', () => {
    expect(SHELL).toContain('.mx-over-main');
  });

  it('Split の grid には main という領域が無い（この前提が崩れたらこのテストごと見直す）', () => {
    const split = SHELL.slice(SHELL.indexOf("data-mx-mode='split'"));
    const areas = split.slice(split.indexOf('grid-template-areas'), split.indexOf('}'));

    expect(areas).not.toContain('main');
  });

  it.each(OVERLAYS)('%s が .mx-over-main を使い、grid-area を自分で持たない', (_name, path) => {
    const source = read(path);
    // コメントには「`grid-area: main` では駄目である」と書いてあるため、宣言だけを見る。
    const declarations = source.replaceAll(/\/\*[\S\s]*?\*\//g, '');

    expect(source).toContain('mx-over-main');
    // `grid-area: main` に戻すと、Split でレイアウトごと崩れる。
    expect(declarations).not.toMatch(/grid-area:\s*main/);
  });
});
