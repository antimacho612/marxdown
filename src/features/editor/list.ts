/**
 * リストのインデント（F-EDIT-09 の `Tab` / `Shift+Tab` / `editor` チャンク）。
 *
 * # 継続入力と自動採番は自前で持たない
 *
 * F-EDIT-09 の `Enter` と F-EDIT-10（自動採番）は、**`@codemirror/lang-markdown` が
 * 既に持っている**。`markdown()` は `addKeymap`（既定 true）で
 * `insertNewlineContinueMarkup` を **`Prec.high`** で入れており、
 * 同じ `Enter` を後から足しても効かない。
 *
 * あちらは構文木を見て動くので、入れ子・引用の中のリスト・tight/loose の
 * 区別まで面倒を見る。行を正規表現で見る自前の実装より確かなので、そちらに任せる。
 * **番号は続きの項目まで振り直される**（`renumberList`）が、それは
 * ユーザーがそのリストを編集した結果であって、勝手な正規化ではない。
 *
 * # `Tab` だけが残る
 *
 * 記法として `Tab` / `Shift+Tab` を挙げているのは F-EDIT-09 だが、
 * **`markdownKeymap` は `Enter` と `Backspace` しか持たない。**
 * `vscodeKeymap` の `indentMore` は `indentUnit`（2 文字）で一律に下げるので、
 * `1. ` の下に入れると 2 文字しか下がらず**入れ子にならない**
 * （CommonMark は親の本文が始まる桁まで下げることを求める）。
 * ここが埋めているのはその差である。
 *
 * **リストでない場所では必ず `false` を返して手を引く。**
 * 返さないと、ただのインデントができなくなる。
 */
import type { ChangeSpec, EditorState, StateCommand } from '@codemirror/state';

const TASK = /^[\t ]*[-*+] +\[[ xX]\] +/;
const BULLET = /^([\t ]*)([-*+] +)/;
const ORDERED = /^([\t ]*)\d+[.)] +/;
const QUOTE = /^[\t ]*(> ?)/;

/**
 * その行の**一段ぶんの幅**（文字数）。リストでも引用でもなければ `null`。
 *
 * **固定の 2 文字にしてはいけない。** CommonMark は入れ子の項目を親の本文が
 * 始まる桁まで下げることを求めるので、`1. ` の下は 3 文字要る。
 *
 * **タスクリストの `[ ] ` は本文であって記法ではない。** `- [ ] ` の下は
 * `- ` と同じ 2 文字で入れ子になるので、箇条書きとして測る
 * （`- [ ] ` の 6 文字ぶん下げると、行が 1 つ深いところへ飛ぶ）。
 */
export function stepOf(text: string): number | null {
  const bullet = BULLET.exec(text);
  // タスクリストは箇条書きでもある。幅は箇条書きとして測る。
  if (TASK.test(text) && bullet) return (bullet[2] ?? '- ').length;

  const ordered = ORDERED.exec(text);
  if (ordered) return ordered[0].length - (ordered[1] ?? '').length;

  if (bullet) return (bullet[2] ?? '- ').length;

  const quote = QUOTE.exec(text);
  if (quote) return (quote[1] ?? '> ').length;

  return null;
}

/* ------------------------------------------------------------------ */
/* インデント                                                          */
/* ------------------------------------------------------------------ */

/** 選択が触れている行。複数カーソルでも 1 行を二度数えない。 */
function selectedLines(state: EditorState): { from: number; text: string }[] {
  const lines: { from: number; text: string }[] = [];
  let last = 0;

  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from).number;
    const final = state.doc.lineAt(range.to).number;
    for (let n = Math.max(first, last + 1); n <= final; n++) {
      const line = state.doc.line(n);
      lines.push({ from: line.from, text: line.text });
      last = n;
    }
  }

  return lines;
}

/**
 * 一段の幅を決める。**選択の中の最初のリスト行の記法から取る。**
 *
 * 行ごとに違う幅で下げると、選択の中の相対的な深さが崩れる。
 * リスト行が 1 つも無ければ `null` を返し、呼び出し側が手を引く。
 */
function stepFor(lines: { text: string }[]): string | null {
  for (const line of lines) {
    const step = stepOf(line.text);
    if (step !== null) return ' '.repeat(step);
  }
  return null;
}

/**
 * `Tab` でリストを一段深くする（F-EDIT-09）。
 *
 * **リスト行が 1 つも無ければ `false`。** その場合の `Tab` は
 * `vscodeKeymap` の `indentMore` に渡る（`keymap.ts` の並び順）。
 */
export const indentList: StateCommand = ({ state, dispatch }) => {
  if (state.readOnly) return false;

  const lines = selectedLines(state);
  const step = stepFor(lines);
  if (step === null) return false;

  const changes: ChangeSpec[] = lines
    .filter((line) => line.text !== '')
    .map((line) => ({ from: line.from, insert: step }));
  if (changes.length === 0) return false;

  dispatch(state.update({ changes, scrollIntoView: true, userEvent: 'input.indent' }));
  return true;
};

/** `Shift+Tab` で一段浅くする。下げ幅ぶんの空白が無ければ、あるだけ削る。 */
export const outdentList: StateCommand = ({ state, dispatch }) => {
  if (state.readOnly) return false;

  const lines = selectedLines(state);
  const step = stepFor(lines);
  if (step === null) return false;

  const changes: ChangeSpec[] = [];
  for (const line of lines) {
    const indent = /^[\t ]*/.exec(line.text)?.[0] ?? '';
    if (indent === '') continue;
    const remove = indent.startsWith('\t') ? 1 : Math.min(step.length, indent.length);
    changes.push({ from: line.from, to: line.from + remove });
  }

  if (changes.length === 0) return false;

  dispatch(state.update({ changes, scrollIntoView: true, userEvent: 'delete.dedent' }));
  return true;
};
