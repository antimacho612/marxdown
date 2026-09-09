/**
 * 書式コマンドをテストから回すための道具
 * （`src/features/editor/format.test.ts` / `list.test.ts`）。
 *
 * 2 つに割ってあり、`marks.ts` が `|` 記法の読み書き（エンジンを知らない）、こちらの `editor-harness.ts` がコマンドを 1 回流すアダプタ（ここだけがエンジンを知る）を担う。
 * エンジンを差し替えたときに書き直したのはこのファイルだけで、テスト本体（`run` / `runAt` の呼び出しと `|` の期待値）は 1 行も変わっていない（[ADR-0009](../docs/adr/0009-editor-engine-monaco.md)）。
 *
 * 本物のエディターを 1 つだけ作る。
 * コマンドが「編集の後にカーソルがどこへ行くか」まで決めている以上、選択範囲の移動もテストの対象である。
 * モデルだけを触ると、`selectionOffsets` を省いたコマンド（行頭の記法だけを差し替えるもの）のカーソルを自分で計算し直すことになり、本番と違う実装を検証してしまう。
 *
 * そこで `runEdit` をそのまま通す。
 * エディターはファイル全体で 1 つを使い回し、1 件ごとには `setValue` で中身だけ入れ替える（毎回作ると 1 件 250ms かかる）。
 *
 * jsdom に無いもの（`ResizeObserver` / `matchMedia` / `queryCommandSupported`）は
 * `tests/setup.ts` にある。`overviewRulerLanes: 0` は canvas を触らせないため。
 */
import { offsetsOf, runEdit, selectionAt, type MarkdownEdit } from '@/features/editor/lazy/edits';
import { monaco } from '@/features/editor/lazy/monaco';

import { parseMarks, printMarks, type MarkedRange } from './marks';

let editor: monaco.editor.IStandaloneCodeEditor | null = null;

function harnessEditor(): monaco.editor.IStandaloneCodeEditor {
  if (editor) return editor;

  const host = document.createElement('div');
  document.body.append(host);

  editor = monaco.editor.create(host, {
    value: '',
    language: 'markdown',
    automaticLayout: false,
    overviewRulerLanes: 0,
    minimap: { enabled: false },
  });
  return editor;
}

function currentModel(): monaco.editor.ITextModel {
  const model = harnessEditor().getModel();
  if (!model) throw new Error('ハーネスのモデルが無い');
  return model;
}

/** 中身と選択範囲を入れ替えて、コマンドを 1 回流す。 */
function apply(edit: MarkdownEdit, doc: string, ranges: readonly MarkedRange[]): string | null {
  const target = harnessEditor();
  const model = currentModel();

  model.setValue(doc);
  // **LF を明示する。** `setValue` はモデルの EOL を推定し直す（N-CMP-03）。
  model.setEOL(monaco.editor.EndOfLineSequence.LF);
  target.setSelections(ranges.map((range) => selectionAt(model, range.from, range.to)));

  if (!runEdit(target, edit, 'test')) return null;

  const after = (target.getSelections() ?? []).map((selection) => offsetsOf(model, selection));
  return printMarks(model.getValue(monaco.editor.EndOfLinePreference.LF), after);
}

/**
 * コマンドを 1 回流す。**手を引いた（`null` を返した）ときは `null`。**
 *
 * `Enter` と `Tab` は「リストでなければ既定の動作へ渡す」ことが要件なので、
 * 手を引いたことと、何も起きなかったことを取り違えられない形にしてある。
 */
export function run(edit: MarkdownEdit, source: string): string | null {
  const { doc, ranges } = parseMarks(source);
  return apply(edit, doc, ranges);
}

/** 複数カーソルで流す。位置は `doc` に対する数値で渡す。 */
export function runAt(edit: MarkdownEdit, doc: string, ranges: number[][]): string | null {
  const marked = ranges.map(([from, to]) => ({ from: from ?? 0, to: to ?? from ?? 0 }));
  return apply(edit, doc, marked);
}

/**
 * コマンドを 1 回流し、**本文だけ**を返す（表の整形 / F-EDIT-11）。
 *
 * `|` 記法を使わない。表の本文にも `|` が現れ、カーソルの印と区別が付かなくなる。
 * カーソルの行き先を見たいコマンドでは `run` / `runAt` を使うこと。
 */
export function runTextAt(edit: MarkdownEdit, doc: string, cursor: number): string | null {
  const target = harnessEditor();
  const model = currentModel();

  model.setValue(doc);
  model.setEOL(monaco.editor.EndOfLineSequence.LF);
  target.setSelections([selectionAt(model, cursor, cursor)]);

  if (!runEdit(target, edit, 'test')) return null;
  return model.getValue(monaco.editor.EndOfLinePreference.LF);
}

/**
 * 選択範囲だけを動かす処理を 1 回流す（表のセル移動 / F-EDIT-11）。
 *
 * `|` 記法は使わない。表の本文にも `|` が現れ、区別が付かなくなる。
 * 位置は `doc` に対する数値で渡し、結果も数値で返す。
 *
 * **手を引いた（`false` を返した）ときは `null`。**
 * `Tab` は表でなければ既定の動作へ渡す必要があり、そこを取り違えられない形にしてある。
 */
export function runMoveAt(
  move: (editor: monaco.editor.ICodeEditor) => boolean,
  doc: string,
  cursor: number,
): { from: number; to: number; text: string } | null {
  const target = harnessEditor();
  const model = currentModel();

  model.setValue(doc);
  model.setEOL(monaco.editor.EndOfLineSequence.LF);
  target.setSelections([selectionAt(model, cursor, cursor)]);

  if (!move(target)) return null;

  const selection = (target.getSelections() ?? [])[0];
  if (!selection) return null;
  const { from, to } = offsetsOf(model, selection);
  return { from, to, text: model.getValueInRange(selection) };
}
