/**
 * スクロール同期のインタフェースの、Monaco 側の実装（`editor` チャンク）。
 *
 * 同期アルゴリズム（`features/view/scroll-sync.ts`）は行番号しか知らず、スクロール量との換算はエンジンごとに違うためここに閉じ込める（ADR-0009）。
 * `document/text.ts` の `EditorTextPort` と同じ形で、`main` 側が interface を持ち `editor` 側が実装を渡す。
 * Monaco の `getTopForLineNumber` と `getScrollTop` は同じ座標系であるため、両者の間に補正は要らない。
 */
import type { EditorScrollPort } from '@/features/view';

import type { monaco } from './monaco';

type Editor = monaco.editor.IStandaloneCodeEditor;

/** 行番号を 1〜行数に丸める。範囲外の値を丸めるのはポート側の責務である。 */
function clampLine(editor: Editor, line: number): number {
  const lines = editor.getModel()?.getLineCount() ?? 1;
  return Math.min(lines, Math.max(1, line));
}

/**
 * 高さ `offset` の位置にある行番号。
 *
 * `getVisibleRanges()` は使わない。返るのは描画されている範囲であり、上端に半分だけ隠れている行を含むかどうかがビューポートの状態に依る。
 * ここで必要なのは指定した高さにある行であるため、単調増加する `getTopForLineNumber` を二分探索する。
 * 折り返しがあっても正しく求められ、`huge.md`（5 万行）でも 16 回で決まる。
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

/** スクロール同期に渡すインタフェースを組み立てる。`mountEditor` から 1 回だけ呼ぶ。 */
export function createScrollPort(editor: Editor): EditorScrollPort {
  return {
    topLine() {
      const offset = editor.getScrollTop();
      const line = lineAtOffset(editor, offset);
      const top = editor.getTopForLineNumber(line);
      // その行の途中まで隠れている分を端数として加算する。
      // 折り返した行は 1 行が複数行ぶんの高さを持つため、行の高さは実測値から取得する。
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
      // 表示範囲の外にあるときだけスクロールする。
      // 既に表示されている行へ移動したときに表示が大きく変わると、移動先を把握しにくくなる。
      editor.revealLineInCenterIfOutsideViewport(target);
      if (options.focus !== false) editor.focus();
    },

    onScroll(listener) {
      const subscription = editor.onDidScrollChange((event) => {
        // 横スクロールでは行番号が変わらないため同期しない。
        if (event.scrollTopChanged) listener();
      });
      return () => {
        subscription.dispose();
      };
    },
  };
}
