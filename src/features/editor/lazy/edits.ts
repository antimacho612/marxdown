/**
 * 編集コマンドの土台（`editor` チャンク / ADR-0009）。
 *
 * コマンドはエディターを直接触らず、モデルと選択範囲から `EditResult` を組み立てて返す。
 * `null` を返すと「処理しなかった」として呼び出し側が既定動作へ渡せる（`Tab` / `Enter` がこれを必要とする）。
 * また、テストをエディター無しで実行できる（`tests/editor-harness.ts`）。
 *
 * 位置は行・桁ではなく文字数（offset）で数える。
 * 書式コマンドが扱うのは記号の数であり、行をまたぐ判定も簡潔に書ける。
 * 境界でのみ `getPositionAt` / `getOffsetAt` を通す。
 * `editor.ts` が LF を明示しているため、offset は LF 基準の文字数と一致する（N-CMP-03）。
 */
import { monaco } from './monaco';

/** offset の範囲。`from === to` ならカーソル。 */
export interface OffsetRange {
  from: number;
  to: number;
}

/** 適用する編集と、その後の選択範囲。 */
export interface EditResult {
  edits: monaco.editor.IIdentifiedSingleEditOperation[];
  /**
   * 編集を適用した後の offset で指定する。
   *
   * 省略した場合は、現在の選択が編集に応じて Monaco 側で移動する。
   * 行頭の記法だけを差し替えるコマンド（見出し・引用・リスト）はこれで足りる。
   * 記号を挿入してカーソルをその内側に置くコマンド（`Ctrl+B` など）では明示する。
   *
   * offset から行・桁への変換は、編集の後でなければ正しい値にならない。
   * 変換は `runEdit` が `ICursorStateComputer` の中で行う。
   * これはモデルを書き換えた後に呼ばれるため、その時点で初めて編集後の座標を取得できる。
   */
  selectionOffsets?: OffsetRange[];
}

/** 編集を組み立てる。処理しない場合は `null` を返す。 */
export type MarkdownEdit = (
  model: monaco.editor.ITextModel,
  selections: readonly monaco.Selection[],
) => EditResult | null;

/** offset の範囲を Monaco の `Range` にする。 */
export function offsetRange(model: monaco.editor.ITextModel, from: number, to: number): monaco.Range {
  return monaco.Range.fromPositions(model.getPositionAt(from), model.getPositionAt(to));
}

/** offset の位置にカーソルを置く選択範囲。 */
export function cursorAt(model: monaco.editor.ITextModel, offset: number): monaco.Selection {
  const at = model.getPositionAt(offset);
  return new monaco.Selection(at.lineNumber, at.column, at.lineNumber, at.column);
}

/** offset の範囲を選択する。 */
export function selectionAt(model: monaco.editor.ITextModel, from: number, to: number): monaco.Selection {
  const start = model.getPositionAt(from);
  const end = model.getPositionAt(to);
  return new monaco.Selection(start.lineNumber, start.column, end.lineNumber, end.column);
}

/** 選択範囲を offset で返す。常に `from <= to` になり、選択の向きは保持しない。 */
export function offsetsOf(
  model: monaco.editor.ITextModel,
  selection: monaco.Selection,
): { from: number; to: number; empty: boolean } {
  const from = model.getOffsetAt(selection.getStartPosition());
  const to = model.getOffsetAt(selection.getEndPosition());
  return { from, to, empty: from === to };
}

/** offset の範囲の文字列。範囲外は空になる。 */
export function textAt(model: monaco.editor.ITextModel, from: number, to: number): string {
  const length = model.getValueLength();
  const start = Math.max(0, Math.min(length, from));
  const end = Math.max(start, Math.min(length, to));
  if (start === end) return '';
  return model.getValueInRange(offsetRange(model, start, end));
}

/** 行の内容と、その行頭の offset。 */
export interface LineInfo {
  number: number;
  text: string;
  /** 行頭の offset。 */
  from: number;
}

/** 指定した行の情報を取り出す。 */
export function lineInfo(model: monaco.editor.ITextModel, lineNumber: number): LineInfo {
  return {
    number: lineNumber,
    text: model.getLineContent(lineNumber),
    from: model.getOffsetAt({ lineNumber, column: 1 }),
  };
}

/**
 * 選択範囲が含むすべての行。複数カーソルでも同じ行を重複させない。
 *
 * 行番号の昇順で返す。
 * 選択が行頭で終わっている場合もその行を含める（範囲の端が含まれる行は対象とする）。
 */
export function selectedLines(model: monaco.editor.ITextModel, selections: readonly monaco.Selection[]): LineInfo[] {
  const numbers = new Set<number>();

  for (const selection of selections) {
    const first = selection.startLineNumber;
    const last = selection.endLineNumber;
    for (let n = first; n <= last; n++) numbers.add(n);
  }

  return [...numbers].toSorted((a, b) => a - b).map((n) => lineInfo(model, n));
}

/** 1 つの選択範囲に対する結果。位置は編集前の offset で指定する。 */
interface RangeResult {
  /** `text` が空なら削除、`from === to` なら挿入。 */
  edits: { from: number; to: number; text: string }[];
  /** この範囲自身の編集を適用した後の offset。 */
  select: OffsetRange;
}

/**
 * 選択範囲ごとに結論を出し、1 つの編集にまとめる。
 *
 * `build` が返す `select` はその範囲自身の編集しか知らないため、複数カーソルでは手前の範囲が入れた記号の分だけ後ろが動く。
 * 昇順に処理して差分を累積することで補正する。
 */
export function byRange(
  model: monaco.editor.ITextModel,
  selections: readonly monaco.Selection[],
  build: (range: { from: number; to: number; empty: boolean }) => RangeResult,
): EditResult {
  const ordered = selections.map((selection) => offsetsOf(model, selection)).toSorted((a, b) => a.from - b.from);

  const edits: monaco.editor.IIdentifiedSingleEditOperation[] = [];
  const selectionOffsets: OffsetRange[] = [];
  let shift = 0;

  for (const range of ordered) {
    const result = build(range);

    let growth = 0;
    for (const edit of result.edits) {
      edits.push({ range: offsetRange(model, edit.from, edit.to), text: edit.text });
      growth += edit.text.length - (edit.to - edit.from);
    }

    selectionOffsets.push({ from: result.select.from + shift, to: result.select.to + shift });
    shift += growth;
  }

  return { edits, selectionOffsets };
}

/**
 * コマンドを 1 回実行する。処理しなかった場合は `false` を返す。
 *
 * `false` を返した場合、呼び出し側（`keymap.ts`）が既定の動作へ渡す。
 * `executeEdits` は Undo の履歴に残るため、`Ctrl+Z` の 1 回で元に戻る。
 */
export function runEdit(editor: monaco.editor.ICodeEditor, edit: MarkdownEdit, source: string): boolean {
  const model = editor.getModel();
  if (!model || editor.getOption(monaco.editor.EditorOption.readOnly)) return false;

  const result = edit(model, editor.getSelections() ?? []);
  if (!result || result.edits.length === 0) return false;

  const after = result.selectionOffsets;
  editor.executeEdits(
    source,
    result.edits,
    after ? () => after.map((range) => selectionAt(model, range.from, range.to)) : undefined,
  );
  // カーソルが表示範囲の外にあるときだけスクロールする。
  const position = editor.getPosition();
  if (position) editor.revealPositionInCenterIfOutsideViewport(position);
  return true;
}
