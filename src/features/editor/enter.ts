/**
 * リストの継続入力と自動採番（F-EDIT-09 の `Enter` / F-EDIT-10 / `editor` チャンク）。
 *
 * # ここは CodeMirror では書かなくてよかった
 *
 * `@codemirror/lang-markdown` が `insertNewlineContinueMarkup` と
 * `deleteMarkupBackward` を既定で持っていた（M2 Phase 4 は「自前のコードを足さずに済んだ」）。
 * **Monaco には無いので、ここが宿題として戻ってきた**
 * （[ADR-0009](../../../docs/adr/0009-editor-engine-monaco.md) の受け入れコスト 1）。
 *
 * # `onEnterRules` では足りない
 *
 * Monaco は言語設定の `onEnterRules` で継続入力を宣言できるが、
 * **足せるのは固定の文字列だけ**である。番号付きリストの次の番号（F-EDIT-10）は
 * 計算しないと出せないので、`Enter` を自分で持つ。
 *
 * # 手を引いたら既定の `Enter` へ渡す
 *
 * リストでも引用でもない行では `null` を返し、`keymap.ts` が Monaco の
 * 既定の改行に渡す。**握り潰すと、ただの改行ができなくなる。**
 *
 * # 続きの項目までは振り直さない
 *
 * `1. 2. 3.` と並んでいる途中で `Enter` を押しても、後続の番号は触らない。
 * 触れば「編集していない箇所のバイト列が変わる」ことになり、N-CMP-03 に反する。
 * Markdown は `1.` が並んでいても正しく採番して描くので、実害も無い
 * （`format.ts` の `toggleOrderedList` と同じ判断）。
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
 * エディタで共通の挙動）。
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
