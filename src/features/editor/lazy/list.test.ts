// @vitest-environment jsdom
/**
 * リストのインデントの回帰テスト（F-EDIT-09 の `Tab` / `Shift+Tab`）。
 *
 * `Tab` は本来インデントのキーであり（`list.ts`）、リストでない場所で処理してしまうと通常のインデントができなくなる。
 * 「何も起きない」ではなく「次のキーバインドへ渡した」ことを確かめる必要があるため、`run` は処理しなかったときだけ `null` を返す。
 * `Enter` の継続入力と自動採番（F-EDIT-10）は `enter.test.ts` で扱う。
 */
import { describe, expect, it } from 'vitest';

import { run } from '../../../../tests/editor-harness';
import { indentList, outdentList, stepOf } from './list';

describe('一段ぶんの幅 (stepOf)', () => {
  /** `1. ` の下は 3 文字要る。2 文字だと入れ子にならない（CommonMark）。 */
  it('記法の幅を返す', () => {
    expect(stepOf('- a')).toBe(2);
    expect(stepOf('* a')).toBe(2);
    expect(stepOf('1. a')).toBe(3);
    expect(stepOf('10. a')).toBe(4);
    expect(stepOf('> a')).toBe(2);
  });

  /** `[ ] ` は本文であって記法ではない。6 文字下げると 1 段深くなる。 */
  it('タスクリストは箇条書きとして測る', () => {
    expect(stepOf('- [ ] a')).toBe(2);
    expect(stepOf('- [x] a')).toBe(2);
  });

  it('リストでも引用でもなければ null', () => {
    expect(stepOf('ただの段落')).toBeNull();
    expect(stepOf('# 見出し')).toBeNull();
  });
});

describe('Tab / Shift+Tab (F-EDIT-09)', () => {
  it('記法の幅ぶん下げる', () => {
    expect(run(indentList, '- a|')).toBe('  - a|');
    expect(run(indentList, '1. a|')).toBe('   1. a|');
  });

  it('タスクリストも 2 文字ぶん', () => {
    expect(run(indentList, '- [ ] a|')).toBe('  - [ ] a|');
  });

  it('戻す', () => {
    expect(run(outdentList, '  - a|')).toBe('- a|');
    expect(run(outdentList, '   1. a|')).toBe('1. a|');
  });

  it('これ以上戻せなければ何もしない', () => {
    expect(run(outdentList, '- a|')).toBeNull();
  });

  it('選択した行をまとめて動かす', () => {
    // 選択の先頭は動かず、挿入した空白を含む形になる（行頭ちょうどに挿入しても、Monaco は選択の先頭を移動しない / ADR-0009）。選択は 2 行に触れたままなので、続けて押せる。
    expect(run(indentList, '|- a\n- b|')).toBe('|  - a\n  - b|');
  });

  /** リストでない場所の `Tab` は `indentMore` に渡す（`keymap.ts` の並び順）。 */
  it('リスト行が 1 つも無ければ手を引く', () => {
    expect(run(indentList, 'ただの段落|')).toBeNull();
    expect(run(outdentList, '  ただの段落|')).toBeNull();
  });
});
