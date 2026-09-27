/**
 * スクロール同期の対応付け（F-MODE-05）。
 *
 * 実際にスクロールが追随するかは E2E（`e2e/specs/split.e2e.ts`）で検証し、ここでは行番号と位置の変換のみを検証する。
 * 純粋な計算であるため、境界条件はここで網羅する。
 *
 * 補間が要るのは、1 行の見出しと 50 行のコードブロックでは行あたりの高さが桁で違うためである。
 * 「一番近いアンカーに合わせる」だけでは、長いブロックの中でプレビューが動かなくなる。
 */
import { describe, expect, it } from 'vitest';

import { internals } from './scroll-sync';

const { lineForTop, topForLine } = internals;

/**
 * 見出し（1 行）とコードブロック（20 行）が並んだ本文を模す。
 * 見出し（1 行目、top 0）、コードフェンス開始（3 行目、top 40）、その後の段落（23 行目、top 400）という高さの違うアンカーを並べる。
 */
const ANCHORS = [
  { line: 1, top: 0 },
  { line: 3, top: 40 },
  { line: 23, top: 400 },
];

describe('行 → 位置', () => {
  it('アンカーそのものの行は、その位置になる', () => {
    expect(topForLine(ANCHORS, 3)).toBe(40);
    expect(topForLine(ANCHORS, 23)).toBe(400);
  });

  /** 「一番近いアンカーに合わせる」方式との違いはここである。 */
  it('アンカーのあいだは線形に補間する', () => {
    // 3 行目（40px）と 23 行目（400px）のちょうど中間 = 13 行目
    expect(topForLine(ANCHORS, 13)).toBe(220);
  });

  it('先頭より前は先頭に貼り付く', () => {
    expect(topForLine(ANCHORS, 1)).toBe(0);
    expect(topForLine(ANCHORS, 0)).toBe(0);
  });

  it('末尾より後ろは末尾に貼り付く', () => {
    expect(topForLine(ANCHORS, 999)).toBe(400);
  });

  /** 本文がまだ描画されていないときに 0 へ移動しない。 */
  it('アンカーが無ければ null', () => {
    expect(topForLine([], 5)).toBeNull();
  });
});

describe('位置 → 行', () => {
  it('アンカーそのものの位置は、その行になる', () => {
    expect(lineForTop(ANCHORS, 40)).toBe(3);
    expect(lineForTop(ANCHORS, 400)).toBe(23);
  });

  it('アンカーのあいだは線形に補間する', () => {
    expect(lineForTop(ANCHORS, 220)).toBe(13);
  });

  it('端は貼り付く', () => {
    expect(lineForTop(ANCHORS, -50)).toBe(1);
    expect(lineForTop(ANCHORS, 9999)).toBe(23);
  });

  it('アンカーが無ければ null', () => {
    expect(lineForTop([], 100)).toBeNull();
  });

  /**
   * 同じ位置に複数のアンカーが並ぶことがある（空要素・隣接するブロック）。
   * 0 除算で NaN を返さない。
   */
  it('高さ 0 の区間があっても壊れない', () => {
    const flat = [
      { line: 1, top: 0 },
      { line: 5, top: 0 },
      { line: 9, top: 100 },
    ];

    expect(lineForTop(flat, 0)).toBe(1);
    expect(Number.isNaN(lineForTop(flat, 50) ?? Number.NaN)).toBe(false);
  });

  it('行が同じ区間があっても壊れない', () => {
    const same = [
      { line: 4, top: 0 },
      { line: 4, top: 80 },
      { line: 9, top: 200 },
    ];

    expect(Number.isNaN(topForLine(same, 4) ?? Number.NaN)).toBe(false);
  });
});

/**
 * 往復して同じ場所へ戻ること。ここが崩れると循環的な同期になる。
 * 主導権の切り替え（`SUPPRESS_MS`）は「ずれても止まる」ための保険であって、変換そのものが対称でなければ、同期のたびにわずかにずれる。
 */
describe('往復', () => {
  it('行 → 位置 → 行 で戻る', () => {
    for (const line of [1, 3, 8, 13, 23]) {
      const top = topForLine(ANCHORS, line);
      expect(top).not.toBeNull();
      expect(lineForTop(ANCHORS, top ?? 0)).toBeCloseTo(line, 6);
    }
  });
});
