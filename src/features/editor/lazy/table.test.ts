// @vitest-environment jsdom
/**
 * 表の入力支援の回帰テスト（F-EDIT-11）。
 *
 * `Tab` は本来インデントのキーであり、表でない場所で握り潰すとただのインデントができなくなる。
 * したがって「何も起きない」ではなく「次のバインドへ渡した」ことを確かめる必要があり、
 * `runMoveAt` は手を引いたときだけ `null` を返す（`list.test.ts` と同じ立場）。
 *
 * `|` 記法（`tests/marks.ts`）は使わない。表の本文にも `|` が現れ、区別が付かなくなる。
 */
import { describe, expect, it } from 'vitest';

import { runMoveAt, runTextAt } from '../../../../tests/editor-harness';
import { formatTable, moveToNextCell, moveToPreviousCell } from './table';

/** 3 行の表。行頭からの offset を数えやすいよう、各行の長さを揃えてある。 */
const TABLE = ['| a | b |', '| - | - |', '| 1 | 2 |'].join('\n');

/** `doc` の中で `needle` が現れる位置。 */
function at(doc: string, needle: string): number {
  return doc.indexOf(needle);
}

describe('セル移動 (Tab)', () => {
  it('次のセルの中身を選択する', () => {
    const result = runMoveAt(moveToNextCell, TABLE, at(TABLE, 'a'));
    expect(result?.text).toBe('b');
  });

  it('行の末尾からは次の行の先頭へ回り込む', () => {
    // 区切り行は飛ばす。編集の対象になるセルではない。
    const result = runMoveAt(moveToNextCell, TABLE, at(TABLE, 'b'));
    expect(result?.text).toBe('1');
  });

  it('前のセルへ戻る (Shift+Tab)', () => {
    const result = runMoveAt(moveToPreviousCell, TABLE, at(TABLE, '2'));
    expect(result?.text).toBe('1');
  });

  it('行の先頭からは前の行の末尾へ回り込む', () => {
    const result = runMoveAt(moveToPreviousCell, TABLE, at(TABLE, '1'));
    expect(result?.text).toBe('b');
  });

  it('空のセルへも移れる', () => {
    const doc = ['| a |  |', '| - | - |'].join('\n');
    const result = runMoveAt(moveToNextCell, doc, at(doc, 'a'));
    expect(result?.text).toBe('');
  });

  it('両端の `|` を省いた表でも動く (GFM)', () => {
    const doc = ['a | b', '- | -'].join('\n');
    expect(runMoveAt(moveToNextCell, doc, at(doc, 'a'))?.text).toBe('b');
  });

  it('表の最後のセルでは手を引く', () => {
    // ここで握り潰すと、表の下に続けて書くときの `Tab` が効かなくなる。
    expect(runMoveAt(moveToNextCell, TABLE, at(TABLE, '2'))).toBeNull();
  });

  it('表の先頭のセルでは手を引く', () => {
    expect(runMoveAt(moveToPreviousCell, TABLE, at(TABLE, 'a'))).toBeNull();
  });

  it('表でない行では手を引く', () => {
    expect(runMoveAt(moveToNextCell, '普通の段落', 2)).toBeNull();
  });

  it('区切り行が無ければ表として扱わない', () => {
    // `a || b` を含むコードブロックの中で `Tab` がセル移動になるのを防ぐ。
    const doc = ['const x = a || b;', 'const y = c || d;'].join('\n');
    expect(runMoveAt(moveToNextCell, doc, 3)).toBeNull();
  });
});

describe('列幅の整形 (Shift+Alt+F)', () => {
  it('`|` の位置を揃える', () => {
    const doc = ['| 名前 | 説明 |', '| --- | --- |', '| a | 長い説明 |'].join('\n');
    expect(runTextAt(formatTable, doc, 0)).toBe(
      ['| 名前 | 説明     |', '| ---- | -------- |', '| a    | 長い説明 |'].join('\n'),
    );
  });

  it('全角を 2 桁として数える', () => {
    // 文字数で揃えると、日本語を含む列だけ `|` の位置がずれる。
    // `あ` は 2 桁なので、下限の 3 桁までは空白 1 つで埋まる。
    const doc = ['| あ | b |', '| - | - |'].join('\n');
    expect(runTextAt(formatTable, doc, 0)).toBe(['| あ  | b   |', '| --- | --- |'].join('\n'));
  });

  it('寄せ方の指定を保つ', () => {
    const doc = ['| a | b | c |', '| :- | :-: | -: |'].join('\n');
    expect(runTextAt(formatTable, doc, 0)).toBe(['| a   | b   | c   |', '| :-- | :-: | --: |'].join('\n'));
  });

  it('両端の `|` を補う', () => {
    const doc = ['a | b', '- | -'].join('\n');
    expect(runTextAt(formatTable, doc, 0)).toBe(['| a   | b   |', '| --- | --- |'].join('\n'));
  });

  it('列の足りない行に空のセルを足す', () => {
    const doc = ['| a | b |', '| - | - |', '| 1 |'].join('\n');
    expect(runTextAt(formatTable, doc, 0)).toBe(['| a   | b   |', '| --- | --- |', '| 1   |     |'].join('\n'));
  });

  it('表の前後の本文には手を出さない (N-CMP-03)', () => {
    const doc = ['前文', '', '| a | b |', '| - | - |', '', '後文'].join('\n');
    const formatted = runTextAt(formatTable, doc, at(doc, '| a')) ?? '';
    expect(formatted.startsWith('前文\n\n')).toBe(true);
    expect(formatted.endsWith('\n\n後文')).toBe(true);
  });

  it('既に揃っていれば手を引く', () => {
    // 手を引くことで、`Shift+Alt+F` を続けて押しても Undo の履歴が積み上がらない。
    const doc = ['| a   | b   |', '| --- | --- |'].join('\n');
    expect(runTextAt(formatTable, doc, 0)).toBeNull();
  });

  it('表の外では手を引く', () => {
    expect(runTextAt(formatTable, '普通の段落', 2)).toBeNull();
  });
});
