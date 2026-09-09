/**
 * プレビュー上のタスクリスト操作（F-VIEW-01 / OQ-05）。
 *
 * 変えるのは**テキストだけ**である（ADR-0002 / 不変条件「Markdown テキストが唯一の真実」）。
 * DOM のチェック状態を真実にしない。押した結果は、テキストが変わったことの帰結として現れる。
 *
 * 自動保存はしない。押した時点でダーティにして、変えたことが見える状態にする（OQ-05 の決定）。
 * 「読んでいるつもりで内容を変えた」ことにはダーティ表示で気づける。
 */
import { markDirty } from './dirty';
import { getDocumentText, replaceDocumentLine } from './text';

/**
 * 行頭の箇条書き記号とチェック記号。
 *
 * `markdown/plugins/task-list.ts` が拾うのと同じ形だけを対象にする。
 * **どちらか片方だけを緩めない。** 描かれていない行を反転できたり、その逆が起きたりする。
 *
 * 記号の直後に空白を要求するのは GFM の規則である。
 * 順序付きリスト（`1. [ ]`）も対象に含まれる。
 */
const TASK_LINE = /^(\s*(?:[-*+]|\d+[.)])\s+\[)([ xX])(\][ \t])/;

/**
 * 指定行のチェックを反転する。
 *
 * 行が見つからないか、その行がタスクリストの形をしていなければ何もせず `null` を返す。
 * 本文中に生 HTML で書かれたチェックボックスから呼ばれた場合がこれに当たる。
 *
 * @param line 0 始まりの行番号（`data-line` の値）。
 * @returns 反転後のチェック状態。何もしなかったときは `null`。
 */
export function toggleTaskAtLine(line: number): boolean | null {
  // メモリ上の本文は常に LF に正規化されている（境界で変換する / N-CMP-03）。
  const lines = getDocumentText().split('\n');
  const target = lines[line];
  if (target === undefined) return null;

  const matched = TASK_LINE.exec(target);
  if (!matched) return null;

  const checked = matched[2] !== ' ';
  const replaced = `${matched[1] ?? ''}${checked ? ' ' : 'x'}${matched[3] ?? ''}${target.slice(matched[0].length)}`;

  if (!replaceDocumentLine(line, replaced)) return null;

  markDirty();
  return !checked;
}
