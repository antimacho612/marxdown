import { describe, expect, it } from 'vitest';

import type { OutlineItem } from '@/markdown/plugins/line-map';

import { fuzzyFilter, fuzzyScore } from './fuzzy';

const HEADINGS: OutlineItem[] = [
  '起動シーケンス',
  'コールド起動',
  'ウォーム起動（単一インスタンス）',
  'Markdown パイプライン',
].map((text, line) => ({ level: 2, text, line, slug: `h${line}` }));

function texts(items: readonly OutlineItem[]): string[] {
  return items.map((item) => item.text);
}

/** 照合する文字列の取り出し方（`fuzzyFilter` の第 3 引数）。 */
const textOf = (item: { text: string }): string[] => [item.text];

describe('見出しのあいまい検索 (Ctrl+Shift+O)', () => {
  it('順番に含まれていれば一致する', () => {
    expect(fuzzyScore('起動シーケンス', '起動')).not.toBeNull();
    expect(fuzzyScore('起動シーケンス', 'きどう')).toBeNull();
    expect(fuzzyScore('Markdown パイプライン', 'mdpipe')).toBeNull();
    expect(fuzzyScore('Markdown パイプライン', 'mark')).not.toBeNull();
  });

  it('大文字小文字を区別しない', () => {
    expect(fuzzyScore('Markdown パイプライン', 'MARKDOWN')).not.toBeNull();
  });

  it('連続して当たったほうが上に来る', () => {
    expect(fuzzyFilter(HEADINGS, '起動', textOf)[0]?.text).toBe('起動シーケンス');
  });

  it('空のクエリでは全件が文書順のまま返る（開いた直後はアウトラインに見える）', () => {
    expect(texts(fuzzyFilter(HEADINGS, '', textOf))).toEqual(texts(HEADINGS));
  });

  it('一致しなければ 0 件', () => {
    expect(fuzzyFilter(HEADINGS, 'zzz', textOf)).toHaveLength(0);
  });

  it('空白は区切りとして無視する', () => {
    expect(fuzzyScore('ウォーム起動（単一インスタンス）', 'ウォーム 単一')).not.toBeNull();
  });
});

describe('照合用の正規化 (#104)', () => {
  it('ひらがなでカタカナに当たる', () => {
    expect(fuzzyScore('ファイルを開く', 'ふぁいる')).not.toBeNull();
    expect(fuzzyScore('コールド起動', 'こーるど')).not.toBeNull();
  });

  it('カタカナでひらがなに当たる', () => {
    expect(fuzzyScore('ここから始める', 'ココ')).not.toBeNull();
  });

  it('濁点と小書きを取り違えない', () => {
    expect(fuzzyScore('ファイル', 'はいる')).toBeNull();
    expect(fuzzyScore('ヴァージョン', 'ゔぁーじょん')).not.toBeNull();
  });

  it('全角で入力しても半角の英数に当たる', () => {
    expect(fuzzyScore('Markdown パイプライン', 'ｍａｒｋ')).not.toBeNull();
    expect(fuzzyScore('h2 見出し', '２')).not.toBeNull();
  });

  it('漢字は読みで引けない（辞書は持たない）', () => {
    expect(fuzzyScore('起動シーケンス', 'きどう')).toBeNull();
  });
});

describe('複数のキーでの照合 (#104)', () => {
  interface Entry {
    label: string;
    keywords: string;
  }

  /**
   * ラベルと英語キーワードの組（コマンドパレットが渡す形）。
   *
   * 順位の検証だけは、ラベルにも英語を含む組を使う。
   * 実際のラベルは日本語しか無いため（`i18n/ja.ts`）、同じクエリが両方のキーに一致する場面を実在のコマンドでは作れない。
   */
  const COMMANDS: Entry[] = [
    { label: 'ファイルを開く', keywords: 'open file document' },
    { label: '名前を付けて保存', keywords: 'save as file write' },
    { label: 'フォルダを開く', keywords: 'open folder directory workspace' },
  ];

  const keysOf = (entry: Entry): string[] => [entry.label, entry.keywords];

  it('ラベルに無い英語でも別名で当たる', () => {
    expect(fuzzyFilter(COMMANDS, 'save', keysOf).map((entry) => entry.label)).toEqual(['名前を付けて保存']);
  });

  it('別名は表示しないラベルと同じ扱いで、かなの正規化も効く', () => {
    expect(fuzzyFilter(COMMANDS, 'ふぁいる', keysOf).map((entry) => entry.label)).toEqual(['ファイルを開く']);
  });

  it('ラベルで当たったものが、別名でしか当たらないものより上に来る', () => {
    const mixed: Entry[] = [
      { label: 'テーブルを整形', keywords: 'format table markdown' },
      { label: 'Mermaid を再描画', keywords: 'mermaid diagram render' },
    ];

    // `mer` はラベル（2 件目）と別名（1 件目の markdown）の両方に一致する。
    expect(fuzzyFilter(mixed, 'mer', keysOf).map((entry) => entry.label)).toEqual([
      'Mermaid を再描画',
      'テーブルを整形',
    ]);
  });

  it('どのキーにも無ければ 0 件', () => {
    expect(fuzzyFilter(COMMANDS, 'mermaid', keysOf)).toHaveLength(0);
  });

  it('空のクエリでは全件が元の並びのまま返る', () => {
    expect(fuzzyFilter(COMMANDS, '', keysOf)).toEqual(COMMANDS);
  });
});
