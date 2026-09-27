// @vitest-environment jsdom
/**
 * スクロール同期のインタフェースの、Monaco 側の実装（F-MODE-05 / `scroll-port.ts`）。
 *
 * 配線ではなく換算を検証する。
 * 「どちらが主導するか」「ダブルクリックがどの行になるか」は `features/view/scroll-sync.dom.test.ts` が偽のポートで検証している。
 * ここで検証するのは行番号とスクロール量の換算である。
 *
 * Monaco の `getTopForLineNumber` はレイアウトではなく設定の `lineHeight` から積み上げて計算するため（`viewLayout`）、描画されない jsdom でも正しい値になる。
 * 折り返しが起きないぶん「1 行 = `lineHeight`」で読めるので、期待値も書ける。
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { monaco } from './monaco';
import { createScrollPort } from './scroll-port';

const LINES = 100;
const LINE_HEIGHT = 20;

let editor: monaco.editor.IStandaloneCodeEditor | null = null;

function harness(): monaco.editor.IStandaloneCodeEditor {
  if (editor) return editor;

  const host = document.createElement('div');
  document.body.append(host);
  editor = monaco.editor.create(host, {
    value: '',
    language: 'markdown',
    automaticLayout: false,
    // 概要ルーラは canvas を使うため無効にする。
    overviewRulerLanes: 0,
    minimap: { enabled: false },
    lineHeight: LINE_HEIGHT,
    wordWrap: 'off',
  });
  return editor;
}

beforeEach(() => {
  const target = harness();
  target.setValue(Array.from({ length: LINES }, (_, index) => `行 ${index + 1}`).join('\n'));
  target.setScrollTop(0);
  target.setPosition({ lineNumber: 1, column: 1 });
});

describe('スクロール量 → 行番号', () => {
  it('先頭では 1 行目', () => {
    expect(createScrollPort(harness()).topLine()).toBe(1);
  });

  it('ちょうど n 行ぶん下げたら n + 1 行目', () => {
    const target = harness();
    target.setScrollTop(10 * LINE_HEIGHT);
    expect(createScrollPort(target).topLine()).toBe(11);
  });

  it('行の途中は端数で返る', () => {
    // 整数に丸めない。
    // 丸めると、行あたりの高さが違う相手（プレビュー）で 1 行ぶんのずれになる。
    const target = harness();
    target.setScrollTop(10 * LINE_HEIGHT + LINE_HEIGHT / 2);
    expect(createScrollPort(target).topLine()).toBeCloseTo(11.5, 5);
  });
});

describe('行番号 → スクロール量', () => {
  it('その行が最上部に来る', () => {
    const target = harness();
    createScrollPort(target).scrollToLine(11);
    expect(target.getScrollTop()).toBe(target.getTopForLineNumber(11));
  });

  it('端数はその行の高さの割合として効く', () => {
    const target = harness();
    createScrollPort(target).scrollToLine(11.5);
    expect(target.getScrollTop()).toBe(target.getTopForLineNumber(11) + LINE_HEIGHT / 2);
  });

  it('往復して戻る', () => {
    const target = harness();
    const port = createScrollPort(target);
    port.scrollToLine(42.25);
    expect(port.topLine()).toBeCloseTo(42.25, 5);
  });
});

describe('ジャンプ', () => {
  it('カーソルをその行の先頭へ置く', () => {
    const target = harness();
    createScrollPort(target).revealLine(50, { focus: false });
    expect(target.getPosition()).toEqual({ lineNumber: 50, column: 1 });
  });

  it('行数を超えた行は末尾に丸める', () => {
    const target = harness();
    createScrollPort(target).revealLine(9999, { focus: false });
    expect(target.getPosition()?.lineNumber).toBe(LINES);
  });

  it('0 以下は 1 行目に丸める', () => {
    const target = harness();
    createScrollPort(target).revealLine(0, { focus: false });
    expect(target.getPosition()?.lineNumber).toBe(1);
  });
});

describe('スクロールの購読', () => {
  it('縦に動いたときだけ呼ばれ、解除できる', () => {
    const target = harness();
    let calls = 0;
    const off = createScrollPort(target).onScroll(() => {
      calls++;
    });

    target.setScrollTop(200);
    expect(calls).toBe(1);

    // 横スクロールでは行番号が変わらない。
    target.setScrollLeft(50);
    expect(calls).toBe(1);

    off();
    target.setScrollTop(400);
    expect(calls).toBe(1);
  });
});
