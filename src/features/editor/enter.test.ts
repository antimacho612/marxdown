// @vitest-environment jsdom
/**
 * リストの継続入力・自動採番・記法の畳み込みの回帰テスト
 * （F-EDIT-09 の `Enter` / F-EDIT-10 / `enter.ts`）。
 *
 * このテストは前は無かった。
 * CodeMirror では `@codemirror/lang-markdown` が持っていたので「自分で書いていないものをテストしない」と決めていたが、Monaco では自作なのでここで見る（[ADR-0009](../../../docs/adr/0009-editor-engine-monaco.md) の受け入れコスト 1）。
 *
 * `Enter` と `Backspace` は本来別の意味を持つキーを横取りしているため、リストでない場所で握り潰すと、ただの改行と 1 文字削除ができなくなる。
 * `null`（＝手を引いた）が期待値になる場面があり、`run` は手を引いたときだけ `null` を返す（`keymap.ts` の `FALLTHROUGH`）。
 */
import { describe, expect, it } from 'vitest';

import { run } from '../../../tests/editor-harness';
import { continuationOf, continueList, deleteMarkupBackward } from './enter';

describe('継続の組み立て (continuationOf)', () => {
  it('箇条書き・引用はそのまま続ける', () => {
    expect(continuationOf('- a')?.prefix).toBe('- ');
    expect(continuationOf('  * a')?.prefix).toBe('  * ');
    expect(continuationOf('> a')?.prefix).toBe('> ');
  });

  /** F-EDIT-10。**次の番号を計算する**ので `onEnterRules` では書けない。 */
  it('番号付きリストは 1 つ進める', () => {
    expect(continuationOf('1. a')?.prefix).toBe('2. ');
    expect(continuationOf('  9) a')?.prefix).toBe('  10) ');
  });

  /** **チェック済みの次はチェックしない。** 続きの項目まで済みで始まる理由が無い。 */
  it('タスクリストは未チェックで続ける', () => {
    expect(continuationOf('- [x] a')?.prefix).toBe('- [ ] ');
    expect(continuationOf('- [ ] a')?.prefix).toBe('- [ ] ');
  });

  it('リストでも引用でもなければ null', () => {
    expect(continuationOf('ただの段落')).toBeNull();
    expect(continuationOf('# 見出し')).toBeNull();
  });
});

describe('Enter で続ける (F-EDIT-09, 10)', () => {
  it('記法を引き継いで次の行を作る', () => {
    expect(run(continueList, '- a|')).toBe('- a\n- |');
    expect(run(continueList, '> a|')).toBe('> a\n> |');
  });

  it('番号は 1 つ進む', () => {
    expect(run(continueList, '1. a|')).toBe('1. a\n2. |');
  });

  /**
   * **続きの項目は振り直さない**（`enter.ts` の但し書き）。
   *
   * 触れば「編集していない箇所のバイト列が変わる」ことになり、N-CMP-03 に反する。
   * Markdown は `1.` が並んでいても正しく採番して描くので、実害も無い。
   *
   * CodeMirror では `@codemirror/lang-markdown` の `renumberList` が振り直していた。
   * **依存が持っていた振る舞いであって、Marxdown が決めたことではない**
   * （[ADR-0009](../../../docs/adr/0009-editor-engine-monaco.md)）。
   * E2E がこの差で 1 本落ちたので、両方に留めてある。
   */
  it('続きの項目の番号は触らない (N-CMP-03)', () => {
    expect(run(continueList, '1. a|\n2. b')).toBe('1. a\n2. |\n2. b');
  });

  it('入れ子の深さを保つ', () => {
    expect(run(continueList, '  - a|')).toBe('  - a\n  - |');
  });

  it('行の途中で押すと、後ろが次の項目になる', () => {
    expect(run(continueList, '- ab|cd')).toBe('- ab\n- |cd');
  });

  /**
   * **記法だけの行で押したら、記法を消して終わる。** 空の項目を増やし続けるより、
   * そこでリストを抜けたい場合がほとんどである（CommonMark 系で共通の挙動）。
   */
  it('空の項目で押すとリストを抜ける', () => {
    expect(run(continueList, '- |')).toBe('|');
    expect(run(continueList, '  1. |')).toBe('|');
  });

  it('選択範囲は置き換わる', () => {
    expect(run(continueList, '- a|bc|d')).toBe('- a\n- |d');
  });

  /** リストでない行の `Enter` は Monaco の既定（`type` で改行）に渡す。 */
  it('リストでなければ手を引く', () => {
    expect(run(continueList, 'ただの段落|')).toBeNull();
    expect(run(continueList, '# 見出し|')).toBeNull();
  });
});

describe('Backspace で記法を畳む', () => {
  /** ここで 1 文字だけ消すと `- ` が `-` になり、リストでも段落でもない形が残る。 */
  it('記法のちょうど後ろなら、記法をまとめて消す', () => {
    expect(run(deleteMarkupBackward, '- |a')).toBe('|a');
    expect(run(deleteMarkupBackward, '1. |a')).toBe('|a');
    expect(run(deleteMarkupBackward, '- [ ] |a')).toBe('|a');
  });

  /** **インデントは残す。** 消したいのは記法であって、入れ子の深さではない。 */
  it('入れ子ならインデントを残す', () => {
    expect(run(deleteMarkupBackward, '  - |a')).toBe('  |a');
  });

  it('記法の後ろでなければ手を引く', () => {
    expect(run(deleteMarkupBackward, '- a|')).toBeNull();
    expect(run(deleteMarkupBackward, 'ただの段落|')).toBeNull();
  });

  it('選択があるときは手を引く', () => {
    expect(run(deleteMarkupBackward, '- |a|')).toBeNull();
  });
});
