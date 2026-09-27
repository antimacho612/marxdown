// @vitest-environment jsdom
/**
 * カーソル位置の間引き（ADR-0005）。
 *
 * `installCursorReport` が使うのは `getPosition()` と `onDidChangeCursorPosition` の 2 つだけであり、本物のエディターを必要としないため Monaco はマウントしない。
 * 偽のエディターなら「1 フレームに何度も動かす」状況を正確に作れるため、間引きをそのまま検証できる。
 *
 * rAF も自前で持つ。
 * jsdom の rAF は実時間で実行されるため、「まだ描画していない」状態を確認できない。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { documentStore } from '@/features/document';

import { installCursorReport, stopCursorReport } from './cursor';
import type { monaco } from './monaco';

type Listener = (e: { position: monaco.IPosition }) => void;

/** 位置を動かせるだけの偽エディター。 */
function fakeEditor(initial: monaco.IPosition | null) {
  let listener: Listener | null = null;
  return {
    editor: {
      getPosition: () => initial,
      onDidChangeCursorPosition: (fn: Listener) => {
        listener = fn;
        return { dispose: () => (listener = null) };
      },
    } as unknown as monaco.editor.IStandaloneCodeEditor,
    move(lineNumber: number, column: number): void {
      listener?.({ position: { lineNumber, column } });
    },
  };
}

/** 予約された rAF のコールバック。`flush()` を呼ぶまで実行されない。 */
let frames: (() => void)[] = [];
let cancelled = 0;

beforeEach(() => {
  frames = [];
  cancelled = 0;
  documentStore.cursor = null;
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => {
    frames.push(() => fn(0));
    return frames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', (handle: number) => {
    cancelled = handle;
    frames = [];
  });
});

afterEach(() => {
  stopCursorReport();
  vi.unstubAllGlobals();
});

function flush(): void {
  const pending = frames;
  frames = [];
  for (const run of pending) run();
}

describe('カーソル位置の報告', () => {
  it('載せた時点の位置は、間引きを通さずすぐ入る', () => {
    const { editor } = fakeEditor({ lineNumber: 3, column: 5 });
    installCursorReport(editor);

    // フレームを進めていなくても、既に反映されている。
    expect(documentStore.cursor).toEqual({ line: 3, column: 5 });
    expect(frames).toHaveLength(0);
  });

  it('1 フレームのあいだに何度動いても、出るのは最後の 1 回だけ', () => {
    const { editor, move } = fakeEditor({ lineNumber: 1, column: 1 });
    installCursorReport(editor);

    move(10, 1);
    move(11, 1);
    move(12, 4);

    // まだ描画していないため、マウントした時点の位置のまま。
    expect(documentStore.cursor).toEqual({ line: 1, column: 1 });
    // 予約は 1 つだけ。
    // 打鍵の数だけ rAF を予約しない。
    expect(frames).toHaveLength(1);

    flush();
    expect(documentStore.cursor).toEqual({ line: 12, column: 4 });
  });

  it('同じ位置に動いた通知では、ストアを書き換えない', () => {
    const { editor, move } = fakeEditor({ lineNumber: 7, column: 2 });
    installCursorReport(editor);
    const first = documentStore.cursor;

    move(7, 2);
    flush();

    // 参照ごと同じ。変化していない値でリアクティビティを発生させない。
    expect(documentStore.cursor).toBe(first);
  });

  it('止めると `null` に戻り、予約したフレームも取り消される', () => {
    const { editor, move } = fakeEditor({ lineNumber: 1, column: 1 });
    installCursorReport(editor);

    move(99, 1);
    expect(frames).toHaveLength(1);

    stopCursorReport();

    expect(documentStore.cursor).toBeNull();
    expect(cancelled).toBe(1);
    // 取り消したフレームが後から実行されて、古い位置が再表示されることはない。
    flush();
    expect(documentStore.cursor).toBeNull();
  });

  it('位置を持たないエディターでは何も出さない', () => {
    const { editor } = fakeEditor(null);
    installCursorReport(editor);

    expect(documentStore.cursor).toBeNull();
  });
});
