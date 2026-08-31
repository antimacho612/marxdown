/**
 * 書式コマンドをテストから回すための道具
 * （`src/features/editor/format.test.ts` / `list.test.ts`）。
 *
 * **`src/` の外に置いてある。** `src/features/editor/` に置くと、
 * `vite.config.ts` の `chunkFileNames` が `editor` チャンクの一部として扱う。
 * 実際にバンドルされることは無い（誰も import しない）が、
 * 予算を見張る対象の中にテスト専用のコードを置かない。
 *
 * # なぜ `|` で書くのか
 *
 * 書式コマンドの正しさは**「どの文字が入ったか」と「カーソルがどこへ行ったか」の
 * 両方**で決まる。位置を数値で書くと、期待値が読めなくなる。
 *
 * ```text
 * '- a|'          カーソルが `a` の後ろ
 * '|word|'        `word` を選択
 * ```
 *
 * `|` は 1 つならカーソル、2 つなら選択範囲。入力も期待値も同じ書き方になる。
 */
import { EditorSelection, EditorState, type StateCommand } from '@codemirror/state';

/** `|` を取り除き、位置に変換する。 */
export function parse(source: string): { doc: string; selection: EditorSelection } {
  const positions: number[] = [];
  let doc = '';

  for (const char of source) {
    if (char === '|') positions.push(doc.length);
    else doc += char;
  }

  const [first, second] = positions;
  if (first === undefined) return { doc, selection: EditorSelection.single(0) };

  return {
    doc,
    selection: second === undefined ? EditorSelection.single(first) : EditorSelection.single(first, second),
  };
}

/** カーソルと選択範囲を `|` に戻す。 */
export function print(state: EditorState): string {
  const doc = state.doc.toString();
  const marks = state.selection.ranges
    .flatMap((range) => (range.empty ? [range.head] : [range.from, range.to]))
    .toSorted((a, b) => b - a);

  let out = doc;
  for (const at of marks) out = `${out.slice(0, at)}|${out.slice(at)}`;
  return out;
}

/**
 * コマンドを 1 回流す。**手を引いた（`false` を返した）ときは `null`。**
 *
 * `Enter` と `Tab` は「リストでなければ既定の動作へ渡す」ことが要件なので、
 * 手を引いたことと、何も起きなかったことを取り違えられない形にしてある。
 */
export function run(command: StateCommand, source: string): string | null {
  const { doc, selection } = parse(source);
  const state = EditorState.create({ doc, selection });

  let next: EditorState | undefined;
  const handled = command({
    state,
    dispatch: (transaction) => {
      next = transaction.state;
    },
  });

  if (!handled || !next) return null;
  return print(next);
}

/** 複数カーソルで流す。位置は `doc` に対する数値で渡す。 */
export function runAt(command: StateCommand, doc: string, ranges: number[][]): string | null {
  const state = EditorState.create({
    doc,
    selection: EditorSelection.create(ranges.map(([from, to]) => EditorSelection.range(from ?? 0, to ?? from ?? 0))),
    extensions: [EditorState.allowMultipleSelections.of(true)],
  });

  let next: EditorState | undefined;
  const handled = command({
    state,
    dispatch: (transaction) => {
      next = transaction.state;
    },
  });

  if (!handled || !next) return null;
  return print(next);
}
