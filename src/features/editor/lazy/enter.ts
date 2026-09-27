/**
 * リストの継続入力と自動採番（F-EDIT-09 の `Enter` / F-EDIT-10 / `editor` チャンク）。
 *
 * Monaco には無いため自作した（ADR-0009 の受け入れコスト 1）。
 * Monaco の `onEnterRules` は固定文字列しか足せず、番号付きリストの次の番号は計算が要るため使えない。
 * リストでも引用でもない行では `null` を返し、Monaco の既定の改行へ渡す（`keymap.ts`）。
 *
 * 続きの項目の番号は振り直さない。
 * 触ると「編集していない箇所が変わる」ことになり N-CMP-03 に反する（Markdown は不連続な採番でも正しく描くので実害も無い）。
 */
import { byRange, lineInfo, offsetRange, type MarkdownEdit } from './edits';

/** 行頭の記法。タスクリストを箇条書きより先に判定する（`- [ ] ` は `- ` にも一致するため）。 */
const TASK = /^([\t ]*)([-*+] )\[[ xX]\] (.*)$/;
const BULLET = /^([\t ]*)([-*+] )(.*)$/;
const ORDERED = /^([\t ]*)(\d+)([.)] )(.*)$/;
const QUOTE = /^([\t ]*)(> ?)(.*)$/;

/** その行を続けるとき、次の行の頭に置くもの。 */
interface Continuation {
  /** 次の行に入れる記法（インデントを含む）。 */
  prefix: string;
  /** 現在の行の記法の長さ。カーソルがその直後にあるかの判定に使う。 */
  markerLength: number;
  /** 記法だけで本文が無い行か。`Enter` でリストを終了する条件になる。 */
  empty: boolean;
}

/**
 * その行の継続を組み立てる。リストでも引用でもなければ `null`。
 *
 * タスクリストは未チェックの状態で継続する。
 * `- [x] ` の次の項目がチェック済みで始まる動作は想定していない。
 */
export function continuationOf(text: string): Continuation | null {
  const task = TASK.exec(text);
  if (task) {
    const [, indent = '', bullet = '- ', body = ''] = task;
    return { prefix: `${indent}${bullet}[ ] `, markerLength: indent.length + bullet.length + 4, empty: body === '' };
  }

  const bullet = BULLET.exec(text);
  if (bullet) {
    const [, indent = '', marker = '- ', body = ''] = bullet;
    return { prefix: indent + marker, markerLength: indent.length + marker.length, empty: body === '' };
  }

  const ordered = ORDERED.exec(text);
  if (ordered) {
    const [, indent = '', number = '1', delimiter = '. ', body = ''] = ordered;
    const next = Number(number) + 1;
    return {
      prefix: `${indent}${String(next)}${delimiter}`,
      markerLength: indent.length + number.length + delimiter.length,
      empty: body === '',
    };
  }

  const quote = QUOTE.exec(text);
  if (quote) {
    const [, indent = '', marker = '> ', body = ''] = quote;
    return { prefix: indent + marker, markerLength: indent.length + marker.length, empty: body === '' };
  }

  return null;
}

/** その行のインデント（Monaco の `autoIndent: 'keep'` と同じもの）。 */
function indentOf(text: string): string {
  return /^[\t ]*/.exec(text)?.[0] ?? '';
}

/**
 * `Enter`。リストや引用の中なら記法を引き継ぎ、番号は 1 つ進める。
 *
 * 記法だけの行で押した場合は、記法を削除してリストを終了する。
 * 空の項目を増やし続けるより、そこで抜ける動作のほうが一般的である（CommonMark 系のエディターで共通の挙動）。
 *
 * カーソルが 1 つでもリストの中にあれば、このコマンドが処理する。
 * リストでない位置のカーソルには、`autoIndent: 'keep'` と同じく前の行のインデントを引き継ぐ改行を挿入する。
 */
export const continueList: MarkdownEdit = (model, selections) => {
  if (selections.length === 0) return null;

  const lines = selections.map((selection) => lineInfo(model, selection.startLineNumber));
  const continuations = lines.map((line) => continuationOf(line.text));
  // ひとつもリストでなければ、Monaco の既定の改行に任せる。
  if (continuations.every((continuation) => continuation === null)) return null;

  return byRange(model, selections, ({ from, to }) => {
    const line = lineInfo(model, model.getPositionAt(from).lineNumber);
    const continuation = continuationOf(line.text);

    if (!continuation) {
      const insert = `\n${indentOf(line.text)}`;
      return { edits: [{ from, to, text: insert }], select: { from: from + insert.length, to: from + insert.length } };
    }

    // 記法だけの行では、記法を削除して終了する。改行は挿入しない。
    if (continuation.empty) {
      const lineEnd = line.from + line.text.length;
      return { edits: [{ from: line.from, to: lineEnd, text: '' }], select: { from: line.from, to: line.from } };
    }

    const insert = `\n${continuation.prefix}`;
    return { edits: [{ from, to, text: insert }], select: { from: from + insert.length, to: from + insert.length } };
  });
};

/**
 * `Backspace` で記法をまとめて削除する。
 *
 * カーソルが記法の直後にあるときだけ動作する。
 * その位置で 1 文字だけ削除すると `- ` が `-` になり、リストでも通常の行でもない状態が残る。
 * 記法をまとめて削除し、通常の行に戻す。
 *
 * 選択があるときや、記法の直後でないときは `null` を返す。
 * その場合は Monaco の既定の `Backspace` に渡るため、通常の 1 文字削除は妨げない。
 */
export const deleteMarkupBackward: MarkdownEdit = (model, selections) => {
  const main = selections[0];
  if (!main || selections.length !== 1 || !main.isEmpty()) return null;

  const line = lineInfo(model, main.startLineNumber);
  const continuation = continuationOf(line.text);
  if (!continuation) return null;

  // カーソルが記法のちょうど後ろにあるときだけ。
  const cursor = model.getOffsetAt(main.getPosition());
  if (cursor !== line.from + continuation.markerLength) return null;

  // インデントは残す。削除の対象は記法であり、入れ子の深さではない。
  const from = line.from + indentOf(line.text).length;
  if (from >= cursor) return null;

  return {
    edits: [{ range: offsetRange(model, from, cursor), text: '' }],
    selectionOffsets: [{ from, to: from }],
  };
};
