/**
 * 表の入力支援（F-EDIT-11 / `editor` チャンク）。
 *
 * 提供するのは 2 つだけである。`Tab` でのセル移動と、列幅の整形。
 * どちらも触るのは Markdown テキストそのものであり、表のモデルを別に持たない（ADR-0002）。
 *
 * 表と判定する条件は GFM に合わせて厳しくしてある。
 * `|` を含む行というだけでは表にしない。区切り行（`|---|---|`）を含むひと続きの塊であることを要求する。
 * 緩めると、`a || b` を含むコードブロックの中で `Tab` がインデントではなくセル移動になる。
 */
import { lineInfo, offsetRange, type MarkdownEdit } from './edits';
import { monaco } from './monaco';

/** 区切り行のセル（`---` / `:---` / `---:` / `:---:`）。 */
const DELIMITER_CELL = /^\s*:?-+:?\s*$/;

/**
 * 全角として数える文字。整形の桁合わせに使う。
 *
 * 日本語の表は等幅フォントで見たときに全角が 2 桁を占める。
 * 文字数で揃えると、日本語を含む列だけ `|` の位置がずれる。
 */
const WIDE = /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏가-힣豈-﫿︰-﹯＀-｠￠-￦]/;

/** 表示上の桁数。全角は 2 桁として数える。 */
function widthOf(text: string): number {
  let width = 0;
  for (const ch of text) width += WIDE.test(ch) ? 2 : 1;
  return width;
}

/** 行内のセルの範囲。位置は行頭からの相対である。 */
interface CellRange {
  from: number;
  to: number;
}

/**
 * エスケープされていない `|` の位置。
 *
 * `\|` はセルの中身であって区切りではない（GFM）。
 */
function pipePositions(text: string): number[] {
  const positions: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\\') {
      i++;
      continue;
    }
    if (text[i] === '|') positions.push(i);
  }
  return positions;
}

/**
 * 行をセルに割る。表の行でなければ空を返す。
 *
 * 両端の `|` は省略できる（GFM）。
 * 省略された側は、`|` の外側に中身があるかどうかで判定する。
 */
function cellRanges(text: string): CellRange[] {
  const pipes = pipePositions(text);
  const first = pipes[0];
  const last = pipes.at(-1);
  if (first === undefined || last === undefined) return [];

  const ranges: CellRange[] = [];
  if (text.slice(0, first).trim() !== '') ranges.push({ from: 0, to: first });
  for (let i = 0; i < pipes.length - 1; i++) {
    ranges.push({ from: (pipes[i] ?? 0) + 1, to: pipes[i + 1] ?? 0 });
  }
  if (text.slice(last + 1).trim() !== '') ranges.push({ from: last + 1, to: text.length });

  return ranges;
}

/** その行が区切り行か。セルが 1 つ以上あり、すべてが `---` の形をしている。 */
function isDelimiterRow(text: string): boolean {
  const cells = cellRanges(text);
  if (cells.length === 0) return false;
  return cells.every((cell) => DELIMITER_CELL.test(text.slice(cell.from, cell.to)));
}

/** 表の範囲。行番号は 1 始まりで、両端を含む。 */
interface TableBlock {
  first: number;
  last: number;
}

/**
 * 指定行を含む表を探す。表でなければ `null`。
 *
 * `|` を含む行が連続している範囲を取り、その中に区切り行があるかどうかで表と判定する。
 */
function tableAt(model: monaco.editor.ITextModel, lineNumber: number): TableBlock | null {
  const total = model.getLineCount();
  const hasPipe = (n: number) => cellRanges(model.getLineContent(n)).length > 0;
  if (!hasPipe(lineNumber)) return null;

  let first = lineNumber;
  while (first > 1 && hasPipe(first - 1)) first--;

  let last = lineNumber;
  while (last < total && hasPipe(last + 1)) last++;

  for (let n = first; n <= last; n++) {
    if (isDelimiterRow(model.getLineContent(n))) return { first, last };
  }
  return null;
}

/** カーソルがどのセルにいるか。範囲外なら `-1`。 */
function cellIndexAt(cells: CellRange[], column: number): number {
  // 境界（`|` の直後・直前）はその左右どちらのセルにも属しうる。手前のセルとして扱う。
  return cells.findIndex((cell) => column >= cell.from && column <= cell.to);
}

/**
 * セルの中身の範囲（前後の空白を除いた位置）。
 *
 * 空のセルでは両端を一致させ、カーソルだけを置く。
 * 前後の空白を両側から削ると範囲が交差するため、区切り記号の直後に置く。
 */
function contentRange(text: string, cell: CellRange): CellRange {
  const raw = text.slice(cell.from, cell.to);
  if (raw.trim() === '') {
    const at = Math.min(cell.from + 1, cell.to);
    return { from: at, to: at };
  }
  const leading = raw.length - raw.trimStart().length;
  const trailing = raw.length - raw.trimEnd().length;
  return { from: cell.from + leading, to: cell.to - trailing };
}

/**
 * 隣のセルへ移る。移れたら `true`。
 *
 * 中身を選択した状態にする。続けて打てば置き換わり、`→` を押せば末尾へ移る。
 * 行の端を越えるときは隣の行へ回り込む。表の外へは出ない（`Tab` の既定動作へ渡す）。
 */
function moveCell(editor: monaco.editor.ICodeEditor, step: 1 | -1): boolean {
  const model = editor.getModel();
  if (!model) return false;

  const selections = editor.getSelections() ?? [];
  const main = selections[0];
  // 複数カーソルのときは扱わない。表の中と外に同時にカーソルがある場合の結論が決められない。
  if (selections.length !== 1 || !main) return false;

  const lineNumber = main.positionLineNumber;
  if (!tableAt(model, lineNumber)) return false;

  const text = model.getLineContent(lineNumber);
  const cells = cellRanges(text);
  const index = cellIndexAt(cells, main.positionColumn - 1);
  if (index === -1) return false;

  const next = index + step;
  if (next >= 0 && next < cells.length) {
    select(editor, lineNumber, contentRange(text, cells[next] ?? { from: 0, to: 0 }));
    return true;
  }

  // 行を跨ぐ。区切り行は編集の対象にならないので飛ばす。
  return moveToAdjacentRow(editor, model, lineNumber, step);
}

/** 隣の行の端のセルへ移る。 */
function moveToAdjacentRow(
  editor: monaco.editor.ICodeEditor,
  model: monaco.editor.ITextModel,
  lineNumber: number,
  step: 1 | -1,
): boolean {
  const block = tableAt(model, lineNumber);
  if (!block) return false;

  for (let n = lineNumber + step; n >= block.first && n <= block.last; n += step) {
    const text = model.getLineContent(n);
    if (isDelimiterRow(text)) continue;

    const cells = cellRanges(text);
    const target = step === 1 ? cells[0] : cells.at(-1);
    if (!target) continue;

    select(editor, n, contentRange(text, target));
    return true;
  }
  return false;
}

/**
 * 行内の相対位置を選択する。
 *
 * ここはモデルを変えない。`Tab` を押した結果が Undo の履歴に残ると、`Ctrl+Z` が編集ではなく移動を戻すことになる。
 */
function select(editor: monaco.editor.ICodeEditor, lineNumber: number, range: CellRange): void {
  const selection = new monaco.Selection(lineNumber, range.from + 1, lineNumber, range.to + 1);
  editor.setSelection(selection);
  editor.revealPositionInCenterIfOutsideViewport(selection.getPosition());
}

/** `Tab` で次のセルへ（F-EDIT-11）。表の中でなければ何もしない。 */
export function moveToNextCell(editor: monaco.editor.ICodeEditor): boolean {
  return moveCell(editor, 1);
}

/** `Shift+Tab` で前のセルへ（F-EDIT-11）。 */
export function moveToPreviousCell(editor: monaco.editor.ICodeEditor): boolean {
  return moveCell(editor, -1);
}

/** 区切り行のセルから読み取った寄せ方。 */
type Align = 'left' | 'center' | 'right' | 'none';

function alignOf(cell: string): Align {
  const trimmed = cell.trim();
  const left = trimmed.startsWith(':');
  const right = trimmed.endsWith(':');
  if (left && right) return 'center';
  if (left) return 'left';
  if (right) return 'right';
  return 'none';
}

/**
 * 区切り行のセルを、寄せ方を保ったまま指定の桁数で組み立てる。
 *
 * `:` を含めてちょうど `width` 桁にする。
 * 列幅の下限が 3 なので、`-` は最低でも 1 本残る（`:-:` は GFM で有効な最短形）。
 */
function delimiterCell(align: Align, width: number): string {
  const colons = align === 'center' ? 2 : align === 'none' ? 0 : 1;
  const dashes = '-'.repeat(Math.max(1, width - colons));
  if (align === 'center') return `:${dashes}:`;
  if (align === 'left') return `:${dashes}`;
  if (align === 'right') return `${dashes}:`;
  return dashes;
}

/** 中身の右側を空白で埋めて指定の桁数にする。全角を 2 桁として数える。 */
function pad(text: string, width: number): string {
  return text + ' '.repeat(Math.max(0, width - widthOf(text)));
}

/**
 * カーソルのある表の列幅を揃える（F-EDIT-11）。
 *
 * 触るのは表の各行だけで、前後の本文には手を出さない（N-CMP-03）。
 * 両端の `|` は必ず付ける。省略された表も付けた形に揃うが、表の意味は変わらない。
 *
 * 列数が行ごとに違う場合は、最も多い行に合わせて空のセルを足す。
 * 足りない列があるまま整形すると、`|` の位置が揃っても表としては読めないままになる。
 */
export const formatTable: MarkdownEdit = (model, selections) => {
  const main = selections[0];
  if (!main) return null;

  const block = tableAt(model, main.positionLineNumber);
  if (!block) return null;

  const rows: { line: number; cells: string[]; delimiter: boolean }[] = [];
  for (let n = block.first; n <= block.last; n++) {
    const text = model.getLineContent(n);
    const delimiter = isDelimiterRow(text);
    rows.push({
      line: n,
      cells: cellRanges(text).map((cell) => text.slice(cell.from, cell.to).trim()),
      delimiter,
    });
  }

  const columns = Math.max(...rows.map((row) => row.cells.length));
  const aligns: Align[] = Array.from({ length: columns }, () => 'none');
  for (const row of rows) {
    if (!row.delimiter) continue;
    for (const [i, cell] of row.cells.entries()) aligns[i] = alignOf(cell);
  }

  const widths = Array.from({ length: columns }, (_, i) =>
    Math.max(3, ...rows.filter((row) => !row.delimiter).map((row) => widthOf(row.cells[i] ?? ''))),
  );

  const edits: monaco.editor.IIdentifiedSingleEditOperation[] = [];
  for (const row of rows) {
    const cells = Array.from({ length: columns }, (_, i) =>
      row.delimiter ? delimiterCell(aligns[i] ?? 'none', widths[i] ?? 3) : pad(row.cells[i] ?? '', widths[i] ?? 3),
    );
    const formatted = `| ${cells.join(' | ')} |`;

    const line = lineInfo(model, row.line);
    if (line.text === formatted) continue;
    edits.push({ range: offsetRange(model, line.from, line.from + line.text.length), text: formatted });
  }

  if (edits.length === 0) return null;

  // 選択範囲は指定しない。行ごと差し替えるため桁は動くが、Monaco が編集に追随して同じ行に残す。
  return { edits };
};
