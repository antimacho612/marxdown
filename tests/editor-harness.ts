/**
 * 書式コマンドをテストから回すための道具
 * （`src/features/editor/format.test.ts` / `list.test.ts`）。
 *
 * # 2 つに割ってある
 *
 * ```text
 * marks.ts            `|` 記法の読み書き。エンジンを知らない
 * editor-harness.ts   コマンドを 1 回流すアダプタ。ここだけがエンジンを知る
 * ```
 *
 * **エンジンを差し替えるときに書き直すのはこのファイルだけになる**
 * （[ADR-0009](../docs/adr/0009-editor-engine-monaco.md) / M2 Phase 8）。
 * テスト本体（`run` / `runAt` の呼び出しと `|` の期待値）は 1 行も変わらない。
 *
 * # なぜ `EditorState` を直接触るのか
 *
 * 書式コマンドは**純粋なテキスト操作**で、DOM も IPC も要らない。
 * CodeMirror は状態を DOM から切り離して持てるので、`EditorView` を作らずに
 * コマンドを流せる。**これは CodeMirror の性質であって、要件ではない。**
 * 同じことができないエンジンでは、ここをモデルの生成に置き換える。
 */
import { EditorSelection, EditorState, type StateCommand } from '@codemirror/state';

import { parseMarks, printMarks, type MarkedRange } from './marks';

function toSelection(ranges: readonly MarkedRange[]): EditorSelection {
  return EditorSelection.create(ranges.map((range) => EditorSelection.range(range.from, range.to)));
}

function toMarkedRanges(state: EditorState): MarkedRange[] {
  return state.selection.ranges.map((range) => ({ from: range.from, to: range.to }));
}

/** 状態を作ってコマンドを 1 回流す。**手を引いたら `undefined`。** */
function apply(command: StateCommand, doc: string, ranges: readonly MarkedRange[]): EditorState | undefined {
  const state = EditorState.create({
    doc,
    selection: toSelection(ranges),
    extensions: [EditorState.allowMultipleSelections.of(true)],
  });

  let next: EditorState | undefined;
  const handled = command({
    state,
    dispatch: (transaction) => {
      next = transaction.state;
    },
  });

  return handled ? next : undefined;
}

/**
 * コマンドを 1 回流す。**手を引いた（`false` を返した）ときは `null`。**
 *
 * `Enter` と `Tab` は「リストでなければ既定の動作へ渡す」ことが要件なので、
 * 手を引いたことと、何も起きなかったことを取り違えられない形にしてある。
 */
export function run(command: StateCommand, source: string): string | null {
  const { doc, ranges } = parseMarks(source);
  const next = apply(command, doc, ranges);

  if (!next) return null;
  return printMarks(next.doc.toString(), toMarkedRanges(next));
}

/** 複数カーソルで流す。位置は `doc` に対する数値で渡す。 */
export function runAt(command: StateCommand, doc: string, ranges: number[][]): string | null {
  const marked = ranges.map(([from, to]) => ({ from: from ?? 0, to: to ?? from ?? 0 }));
  const next = apply(command, doc, marked);

  if (!next) return null;
  return printMarks(next.doc.toString(), toMarkedRanges(next));
}
