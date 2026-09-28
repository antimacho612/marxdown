/**
 * 設定で有効化する追加記法。
 *
 * 検証したいのは「ON にしたものだけが実際に描画へ反映される」ことと、「既定では何も適用されない」ことである。
 * どれも既定 OFF なのは、標準的でない記法が意図せず発火して本文が壊れるほうが認知負荷が高いためで、ここが緩むと `==` や `~` を普通に含む文書の見た目が意図せず変わる。
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { render, resetMarkdownIt } from '../pipeline';
import { loadSyntax, resetSyntax, SYNTAX_NAMES, type SyntaxName } from './syntax';

/** 記法を読み込んだうえで描画する。実際の経路（`markdown/parser.ts`）と同じ順序である。 */
async function renderWith(text: string, names: readonly string[]): Promise<string> {
  await loadSyntax(names);
  resetMarkdownIt();
  return render(text, { syntax: names }).html;
}

/** 行末の `\` で次の行と 1 つのセルにする表。 */
const MULTILINE_TABLE = '| 方式 | 説明 |\n| --- | --- |\n| TTL | 失効させる。 |\\\n|     | 実装が簡単。 |\n';

/**
 * 記法ごとの見本と、有効にしたときに描画結果へ現れるもの。
 *
 * NOTE: 記法を追加したときに見本の追加を型で強制するため、`Record<SyntaxName, …>` にしてある。
 * 名前の一覧だけを検査していた間は、有効にすると描画が例外で失敗する記法（`multilineTables`）を検出できなかった。
 */
const SAMPLES: Record<SyntaxName, { source: string; expected: string | RegExp }> = {
  abbreviations: {
    source: '*[HTML]: HyperText Markup Language\n\nHTML を書く\n',
    expected: '<abbr title="HyperText Markup Language">HTML</abbr>',
  },
  definitionLists: { source: '用語\n: 説明\n', expected: '<dl>' },
  insertions: { source: '++挿入++', expected: '<ins>挿入</ins>' },
  marks: { source: '==強調==', expected: '<mark>強調</mark>' },
  multilineTables: { source: MULTILINE_TABLE, expected: /<td>\s*<p[^>]*>失効させる。\n実装が簡単。<\/p>/ },
  subscript: { source: 'H~2~O', expected: '<sub>2</sub>' },
  superscript: { source: 'x^2^', expected: '<sup>2</sup>' },
};

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

  it('行末の \\ で次の行とセルをまとめない', () => {
    expect(render(MULTILINE_TABLE).html).not.toMatch(SAMPLES.multilineTables.expected);
  });
});

describe('ON にしたものだけが効く', () => {
  it.each(SYNTAX_NAMES)('%s を有効にすると描画に反映される', async (name) => {
    const { source, expected } = SAMPLES[name];
    expect(await renderWith(source, [name])).toMatch(expected);
  });

  it('すべてを同時に有効にしても描画できる', async () => {
    const source = SYNTAX_NAMES.map((name) => SAMPLES[name].source).join('\n\n');
    const html = await renderWith(source, SYNTAX_NAMES);
    for (const name of SYNTAX_NAMES) expect(html).toMatch(SAMPLES[name].expected);
  });

  it('ON にしていないものは巻き添えで有効にならない', async () => {
    const html = await renderWith('H~2~O と x^2^', ['subscript']);
    expect(html).toContain('<sub>');
    expect(html).not.toContain('<sup>');
  });
});

describe('複数行の表', () => {
  it('^^ で上のセルと縦に結合する', async () => {
    const html = await renderWith('| 方式 | p95 |\n| --- | --- |\n| TTL | 22ms |\n| ^^ | 18ms |\n', [
      'multilineTables',
    ]);
    expect(html).toContain('<td rowspan="2">TTL</td>');
  });

  it('空行で区切った表を 1 つの表にまとめない', async () => {
    // プラグインの既定（`multibody: true`）のままだと、後ろの表が前の表の本文として解釈される。
    const source = '| a | b |\n| --- | --- |\n| 1 | 2 |\n\n| c | d |\n| --- | --- |\n| 3 | 4 |\n';
    const html = await renderWith(source, ['multilineTables']);
    expect(html.match(/<table/g)).toHaveLength(2);
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
