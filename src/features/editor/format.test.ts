// @vitest-environment jsdom
/**
 * Markdown 書式コマンドの回帰テスト（F-EDIT-08 / 03.ux-spec/04-keybindings.md §5）。
 *
 * # ここで全部見る
 *
 * 書式コマンドは**純粋なテキスト操作**で、DOM も IPC も要らない。
 * E2E で 1 パターンずつ確かめるより、ここで境目を並べたほうが速くて確実に多い。
 * E2E（`e2e/specs/edit.e2e.ts`）が見るのは「キーが本当に届くか」だけでよい。
 *
 * 入力と期待値の書き方は `tests/editor-harness.ts`。`|` が 1 つならカーソル、
 * 2 つなら選択範囲で、**カーソルがどこへ行ったかも期待値に含める**。
 */
import { describe, expect, it } from 'vitest';

import { run, runAt } from '../../../tests/editor-harness';
import {
  insertLink,
  setHeading,
  toggleBlockquote,
  toggleBold,
  toggleBulletList,
  toggleCodeBlock,
  toggleInlineCode,
  toggleItalic,
  toggleOrderedList,
  toggleStrikethrough,
  toggleTaskCheck,
} from './format';

describe('囲みのトグル (§5)', () => {
  it('選択が無ければ記号だけ入れて、あいだにカーソルを置く', () => {
    expect(run(toggleBold, 'a|b')).toBe('a**|**b');
    expect(run(toggleItalic, 'a|b')).toBe('a*|*b');
    expect(run(toggleInlineCode, 'a|b')).toBe('a`|`b');
    expect(run(toggleStrikethrough, 'a|b')).toBe('a~~|~~b');
  });

  it('選択があれば囲み、選択は中身のまま残る', () => {
    expect(run(toggleBold, 'a |word| b')).toBe('a **|word|** b');
  });

  it('記号ごと選んでいれば外す', () => {
    expect(run(toggleBold, 'a |**word**| b')).toBe('a |word| b');
  });

  it('中身だけ選んでいても外す', () => {
    // これを拾えないと「押すたびに記号が増える」ことになる。
    expect(run(toggleBold, 'a **|word|** b')).toBe('a |word| b');
  });

  /**
   * **`*` は太字と斜体で記号を共有している。**
   * 連続数で見分けないと、太字に斜体を掛けたときに太字の記号を剥がしてしまう。
   */
  it('太字に斜体を掛けても、太字を壊さない', () => {
    expect(run(toggleItalic, '|**word**|')).toBe('*|**word**|*');
    expect(run(toggleItalic, '|***word***|')).toBe('|**word**|');
    expect(run(toggleBold, '|***word***|')).toBe('|*word*|');
    expect(run(toggleItalic, '|*word*|')).toBe('|word|');
  });

  it('複数カーソルすべてに適用する', () => {
    // `a b` の `a` と `b` をそれぞれ選ぶ
    expect(
      runAt(toggleBold, 'a b', [
        [0, 1],
        [2, 3],
      ]),
    ).toBe('**|a|** **|b|**');
  });
});

describe('リンク (F-EDIT-08)', () => {
  it('選択範囲がリンクテキストになり、カーソルは URL の位置へ行く', () => {
    expect(run(insertLink, 'see |docs| now')).toBe('see [docs](|) now');
  });

  it('選択が無ければ、先に文字を打てる位置へ置く', () => {
    expect(run(insertLink, 'see | now')).toBe('see [|]() now');
  });
});

describe('行頭の記法', () => {
  it('箇条書きを付ける / 外す', () => {
    expect(run(toggleBulletList, 'a|bc')).toBe('- a|bc');
    expect(run(toggleBulletList, '- a|bc')).toBe('a|bc');
  });

  /**
   * **選択したぶんだけ 1 から振る。** 続きの行までは触らない（N-CMP-03 / `format.ts`）。
   *
   * **選択の先頭は動かず、入れた `1. ` を含む形になる。** 行頭ちょうどに文字を入れたとき、
   * CodeMirror は選択の先頭を挿入の後ろへ押し出していたが、Monaco は押し出さない（ADR-0009）。
   * **選択は 3 行に触れたまま**なので、もう一度押せば外れるところは変わらない。
   */
  it('番号付きリストは選択したぶんだけ 1 から振る', () => {
    expect(run(toggleOrderedList, '|a\nb\nc|')).toBe('|1. a\n2. b\n3. c|');
  });

  it('箇条書きと番号付きリストは互いに置き換わる', () => {
    expect(run(toggleBulletList, '1. a|')).toBe('- a|');
    expect(run(toggleOrderedList, '- a|')).toBe('1. a|');
  });

  it('タスクリストを箇条書きから外すと、チェックごと消える', () => {
    expect(run(toggleBulletList, '- [ ] a|')).toBe('a|');
  });

  it('引用を付ける / 外す', () => {
    expect(run(toggleBlockquote, 'a|')).toBe('> a|');
    expect(run(toggleBlockquote, '> a|')).toBe('a|');
  });

  /**
   * **混ざった選択は「付ける」に倒す。** 行ごとにトグルすると、
   * 押した結果が選択の中身に依存して読めなくなる（Principle 3）。
   */
  it('1 行でも引用でなければ、全部に付ける', () => {
    expect(run(toggleBlockquote, '|> a\nb|')).toBe('|> a\n> b|');
  });

  it('見出しはレベルを設定する（同じレベルを押しても外れない）', () => {
    expect(run(setHeading(2), 'a|')).toBe('## a|');
    expect(run(setHeading(2), '## a|')).toBeNull();
    expect(run(setHeading(3), '## a|')).toBe('### a|');
    expect(run(setHeading(0), '### a|')).toBe('a|');
  });

  it('空行に見出しは付けない', () => {
    expect(run(setHeading(1), '|')).toBeNull();
  });
});

describe('タスクリストのチェック', () => {
  it('切り替える', () => {
    expect(run(toggleTaskCheck, '- [ ] a|')).toBe('- [x] a|');
    expect(run(toggleTaskCheck, '- [x] a|')).toBe('- [ ] a|');
    expect(run(toggleTaskCheck, '- [X] a|')).toBe('- [ ] a|');
  });

  /** `- ` を勝手に `- [ ] ` へ変えない。求められているのはチェックの切替だけ。 */
  it('タスクリストでない行では何もしない', () => {
    expect(run(toggleTaskCheck, '- a|')).toBeNull();
    expect(run(toggleTaskCheck, 'a|')).toBeNull();
  });
});

describe('コードブロック', () => {
  it('選択した行を囲む', () => {
    expect(run(toggleCodeBlock, '|const x = 1|')).toBe('```\n|const x = 1|\n```');
  });

  it('囲まれていればほどく', () => {
    expect(run(toggleCodeBlock, '```\n|const x = 1|\n```')).toBe('|const x = 1|');
  });

  it('空行なら空のブロックを入れて、あいだへ運ぶ', () => {
    expect(run(toggleCodeBlock, '|')).toBe('```\n|\n```');
  });
});
