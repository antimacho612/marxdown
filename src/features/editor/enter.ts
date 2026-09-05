/**
 * リストの継続入力と自動採番（F-EDIT-09 の `Enter` / F-EDIT-10 / `editor` チャンク）。
 *
 * CodeMirror では `@codemirror/lang-markdown` が既定で持っていたが Monaco には無いため自作した（ADR-0009 の受け入れコスト 1）。
 * Monaco の `onEnterRules` は固定文字列しか足せず、番号付きリストの次の番号は計算が要るため使えない。
 * リストでも引用でもない行では `null` を返し、Monaco の既定の改行へ渡す（`keymap.ts`）。
 *
 * 続きの項目の番号は振り直さない。
 * 触ると「編集していない箇所が変わる」ことになり N-CMP-03 に反する（Markdown は不連続な採番でも正しく描くので実害も無い）。
 */
import { byRange, lineInfo, offsetRange, type MarkdownEdit } from './edits';

/** 行頭の記法。**タスクリストを箇条書きより先に見る**（`- [ ] ` は `- ` でもある）。 */
const TASK = /^([\t ]*)([-*+] )\[[ xX]\] (.*)$/;
const BULLET = /^([\t ]*)([-*+] )(.*)$/;
const ORDERED = /^([\t ]*)(\d+)([.)] )(.*)$/;
const QUOTE = /^([\t ]*)(> ?)(.*)$/;

/** その行を続けるとき、次の行の頭に置くもの。 */
interface Continuation {
  /** 次の行に入れる記法（インデントを含む）。 */
  prefix: string;
  /** いまの行の記法の長さ。カーソルがここちょうどにあるかを見るのに使う。 */
  markerLength: number;
  /** 記法だけで中身が無い行か。**`Enter` で終わらせる合図。** */
  empty: boolean;
}

/**
 * その行の継続を組み立てる。リストでも引用でもなければ `null`。
 *
 * **タスクリストは未チェックで続ける。** `- [x] ` の次の項目まで
 * チェック済みで始まるのは、まず求められていない。
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
 * **記法だけの行で押したら、記法を消してリストを終える。** 空の項目を
 * 増やし続けるより、そこで抜けたい場合がほとんどである（CommonMark 系の
 * エディターで共通の挙動）。
 *
 * **カーソルが 1 つでもリストの中にあれば引き受ける。** リストでない位置の
 * カーソルには、`autoIndent: 'keep'` と同じ「前の行のインデントを継ぐ改行」を入れる。
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

    // 記法だけの行 → 記法を消して終わる。**改行は入れない。**
    if (continuation.empty) {
      const lineEnd = line.from + line.text.length;
      return { edits: [{ from: line.from, to: lineEnd, text: '' }], select: { from: line.from, to: line.from } };
    }

    const insert = `\n${continuation.prefix}`;
    return { edits: [{ from, to, text: insert }], select: { from: from + insert.length, to: from + insert.length } };
  });
};

/**
 * `Backspace` で記法を畳む。
 *
 * **カーソルが記法のちょうど後ろにあるときだけ効く。** そこで 1 文字だけ消すと
 * `- ` が `-` になって、リストでもただの行でもない中途半端な形が残る。
 * 記法をまとめて消して、素の行に戻す。
 *
 * 選択があるときや、記法の後ろでないときは `null`。**Monaco の既定の
 * `Backspace` に渡る**ので、普通の 1 文字削除は妨げない。
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

  // **インデントは残す。** 消したいのは記法であって、入れ子の深さではない。
  const from = line.from + indentOf(line.text).length;
  if (from >= cursor) return null;

  return {
    edits: [{ range: offsetRange(model, from, cursor), text: '' }],
    selectionOffsets: [{ from, to: from }],
  };
};
