/**
 * リストのインデント（F-EDIT-09 の `Tab` / `Shift+Tab` / `editor` チャンク）。
 *
 * Monaco の既定 `Tab` は `tabSize`（2 文字）で一律に下げるが、`1. ` の下は CommonMark 上 3 文字下げないと入れ子にならない。
 * その差をここで埋める。
 * リストでない場所では `null` を返して `keymap.ts` に既定の `Tab` を渡す。
 * 継続入力と自動採番は隣の `enter.ts` が扱う（どちらも Monaco に無いため自作 / ADR-0009）。
 */
import { offsetRange, selectedLines, type MarkdownEdit } from './edits';
import type { monaco } from './monaco';

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
 * **リスト行が 1 つも無ければ手を引く。** その場合の `Tab` は
 * Monaco の既定のインデントに渡る（`keymap.ts`）。
 */
export const indentList: MarkdownEdit = (model, selections) => {
  const lines = selectedLines(model, selections);
  const step = stepFor(lines);
  if (step === null) return null;

  const edits: monaco.editor.IIdentifiedSingleEditOperation[] = lines
    .filter((line) => line.text !== '')
    .map((line) => ({ range: offsetRange(model, line.from, line.from), text: step }));

  if (edits.length === 0) return null;
  return { edits };
};

/** `Shift+Tab` で一段浅くする。下げ幅ぶんの空白が無ければ、あるだけ削る。 */
export const outdentList: MarkdownEdit = (model, selections) => {
  const lines = selectedLines(model, selections);
  const step = stepFor(lines);
  if (step === null) return null;

  const edits: monaco.editor.IIdentifiedSingleEditOperation[] = [];
  for (const line of lines) {
    const indent = /^[\t ]*/.exec(line.text)?.[0] ?? '';
    if (indent === '') continue;
    const remove = indent.startsWith('\t') ? 1 : Math.min(step.length, indent.length);
    edits.push({ range: offsetRange(model, line.from, line.from + remove), text: '' });
  }

  if (edits.length === 0) return null;
  return { edits };
};
