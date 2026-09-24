/**
 * 見出しから折りたたむ範囲を作る（`folding.ts`）。
 * Monaco を読み込まずにテストできるよう、計算だけを分けてある。
 */
import type { OutlineItem } from '@/markdown/plugins/line-map';

/** 折りたたむ範囲。行番号は Monaco と同じ 1 始まりで、`start` の行は畳んでも残る。 */
export interface HeadingRange {
  start: number;
  end: number;
}

/**
 * 見出しから折りたたむ範囲を作る。
 *
 * 見出しの範囲は、同じかそれより上の階層の次の見出しの直前までである。
 * 末尾の空行は含めない。含めると、畳んだときに次の見出しとの間の空行まで隠れる。
 * `lineCount` を超える見出しは無視する（本文より古い見出しを渡されたとき）。
 *
 * @param items 文書順に並んだ見出し。`line` は 0 始まり。
 * @param isBlank 1 始まりの行番号を受け取り、空行（空白だけの行を含む）かを返す。
 */
export function headingRanges(
  items: readonly Pick<OutlineItem, 'level' | 'line'>[],
  lineCount: number,
  isBlank: (line: number) => boolean,
): HeadingRange[] {
  // 各見出しの範囲の最終行。範囲が確定していない見出しをスタックに保持し、同じかそれより上の階層が現れた時点で確定させる。
  // 次の見出しの 0 始まりの行番号は、1 始まりで数えた直前の行と同じ値になる。
  const ends = Array.from({ length: items.length }, () => lineCount);
  const open: number[] = [];
  for (const [index, item] of items.entries()) {
    while (open.length > 0) {
      const top = open.at(-1) ?? 0;
      if ((items[top]?.level ?? 0) < item.level) break;
      ends[top] = item.line;
      open.pop();
    }
    open.push(index);
  }

  const ranges: HeadingRange[] = [];
  for (const [index, item] of items.entries()) {
    const start = item.line + 1;
    let end = Math.min(ends[index] ?? lineCount, lineCount);
    while (end > start && isBlank(end)) end--;
    if (end > start) ranges.push({ start, end });
  }
  return ranges;
}
