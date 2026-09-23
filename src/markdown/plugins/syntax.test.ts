/**
 * 設定で有効化する追加記法（04.tech-stack/04-markdown.md §3）。
 *
 * 検証したいのは「ON にしたものだけが適用される」ことと、「既定では何も適用されない」ことである。
 * どれも既定 OFF なのは、標準的でない記法が意図せず発火して本文が壊れるほうが認知負荷が高いためで、ここが緩むと `==` や `~` を普通に含む文書の見た目が意図せず変わる。
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { render, resetMarkdownIt } from '../pipeline';
import { loadSyntax, resetSyntax, SYNTAX_NAMES } from './syntax';

/** 記法を読み込んだうえで描画する。実際の経路（`markdown/parser.ts`）と同じ順序である。 */
async function renderWith(text: string, names: readonly string[]): Promise<string> {
  await loadSyntax(names);
  resetMarkdownIt();
  return render(text, { syntax: names }).html;
}

beforeEach(() => {
  resetSyntax();
  resetMarkdownIt();
});

describe('既定では 1 つも効かない', () => {
  it.each([
    ['下付き', 'H~2~O', '<sub>'],
    ['上付き', 'x^2^', '<sup>'],
    ['マーカー', '==強調==', '<mark>'],
    ['挿入', '++挿入++', '<ins>'],
  ])('%s は素のテキストのまま', (_label, source, tag) => {
    expect(render(source).html).not.toContain(tag);
  });

  it('定義リストにならない', () => {
    expect(render('用語\n: 説明\n').html).not.toContain('<dl>');
  });
});

describe('ON にしたものだけが効く', () => {
  it('下付きを有効にする', async () => {
    expect(await renderWith('H~2~O', ['subscript'])).toContain('<sub>2</sub>');
  });

  it('上付きを有効にする', async () => {
    expect(await renderWith('x^2^', ['superscript'])).toContain('<sup>2</sup>');
  });

  it('マーカーを有効にする', async () => {
    expect(await renderWith('==強調==', ['marks'])).toContain('<mark>');
  });

  it('挿入を有効にする', async () => {
    expect(await renderWith('++挿入++', ['insertions'])).toContain('<ins>');
  });

  it('定義リストを有効にする', async () => {
    expect(await renderWith('用語\n: 説明\n', ['definitionLists'])).toContain('<dl>');
  });

  it('略語を有効にする', async () => {
    const html = await renderWith('*[HTML]: HyperText Markup Language\n\nHTML を書く\n', ['abbreviations']);
    expect(html).toContain('<abbr');
  });

  it('ON にしていないものは巻き添えで有効にならない', async () => {
    const html = await renderWith('H~2~O と x^2^', ['subscript']);
    expect(html).toContain('<sub>');
    expect(html).not.toContain('<sup>');
  });
});

describe('壊れた指定', () => {
  it('知らない名前は黙って飛ばす', async () => {
    // `settings.json` は人が書くファイルであり、綴りの誤りも未知のキーも入りうる。
    await expect(loadSyntax(['この記法は無い'])).resolves.toBeUndefined();
    expect(render('本文', { syntax: ['この記法は無い'] }).html).toContain('本文');
  });

  it('読み込む前に描画しても本文は出る', () => {
    // 記法が 1 つ適用されないことより、本文が描画されないことのほうがはるかに悪い。
    expect(render('H~2~O', { syntax: ['subscript'] }).html).toContain('H~2~O');
  });
});

describe('一覧', () => {
  it('名前が設定キー（`markdown.*`）と 1 対 1 で対応する', () => {
    // ずれると、設定を ON にしても何も起きない状態になる。
    expect([...SYNTAX_NAMES].toSorted()).toEqual([
      'abbreviations',
      'definitionLists',
      'insertions',
      'marks',
      'multilineTables',
      'subscript',
      'superscript',
    ]);
  });
});
