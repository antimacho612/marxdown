/**
 * スクロール同期の窓口の、Monaco 側の実装（`editor` チャンク）。
 *
 * 同期アルゴリズム（`features/view/scroll-sync.ts`）は行番号しか知らず、スクロール量との換算はエンジンごとに違うためここに閉じ込める（ADR-0009）。
 * `document/text.ts` の `EditorTextPort` と同じ形で、`main` 側が interface を持ち `editor` 側が実装を渡す。
 * CodeMirror では `scrollDOM.scrollTop` と `lineBlockAt*` の座標系がパディング分ズレていたが、Monaco の `getTopForLineNumber` / `getScrollTop` は同じ座標系なので補正が要らない。
 */
import type { EditorScrollPort } from '@/features/view/scroll-sync';

import type { monaco } from './monaco';

type Editor = monaco.editor.IStandaloneCodeEditor;

/** 行番号を 1〜行数に丸める。範囲外を弾くのはポート側の責務。 */
function clampLine(editor: Editor, line: number): number {
  const lines = editor.getModel()?.getLineCount() ?? 1;
  return Math.min(lines, Math.max(1, line));
}

/**
 * 高さ `offset` に載っている行番号。
 *
 * **`getVisibleRanges()` は使わない。** あちらが返すのは「描かれている範囲」で、
 * 上端に半分だけ隠れている行を含むかどうかがビューポートの状態に依る。
 * ここが欲しいのは「その高さにある行」なので、**単調増加する
 * `getTopForLineNumber` を二分探索する。** 折り返しがあっても正しく、
 * `huge.md`（5 万行）でも 16 回で決まる。
 */
function lineAtOffset(editor: Editor, offset: number): number {
  let low = 1;
  let high = editor.getModel()?.getLineCount() ?? 1;

  while (low < high) {
    const middle = Math.floor((low + high + 1) / 2);
    if (editor.getTopForLineNumber(middle) <= offset) low = middle;
    else high = middle - 1;
  }

  return low;
}

export function createScrollPort(editor: Editor): EditorScrollPort {
  return {
    topLine() {
      const offset = editor.getScrollTop();
      const line = lineAtOffset(editor, offset);
      const top = editor.getTopForLineNumber(line);
      // その行の途中まで隠れているぶんを端数として足す。**折り返した行は
      // 1 行が数行ぶんの高さを持つ**ので、行の高さは実測から取る。
      const height = editor.getBottomForLineNumber(line) - top;
      const fraction = height > 0 ? Math.min(1, Math.max(0, (offset - top) / height)) : 0;
      return line + fraction;
    },

    scrollToLine(line) {
      const whole = clampLine(editor, Math.floor(line));
      const top = editor.getTopForLineNumber(whole);
      const height = editor.getBottomForLineNumber(whole) - top;
      editor.setScrollTop(top + height * (line - Math.floor(line)));
    },

    revealLine(line, options = {}) {
      const target = clampLine(editor, line);
      editor.setPosition({ lineNumber: target, column: 1 });
      // 画面の外にあるときだけ動かす。既に見えている行へ飛んだときに
      // 画面表示が急に変わると、どこへ飛んだのか分からなくなる。
      editor.revealLineInCenterIfOutsideViewport(target);
      if (options.focus !== false) editor.focus();
    },

    onScroll(listener) {
      const subscription = editor.onDidScrollChange((event) => {
        // 横スクロールでは同期しない。行番号が変わっていない。
        if (event.scrollTopChanged) listener();
      });
      return () => {
        subscription.dispose();
      };
    },
  };
}
