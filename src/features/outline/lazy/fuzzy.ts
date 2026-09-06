/**
 * 見出しのあいまい検索（`Ctrl+Shift+O` / 03.ux-spec/04-keybindings.md §3「移動」）。
 * `open-jump.ts` から先の遅延チャンク側にあり、使わない人には起動時に読ませない。
 *
 * fzf 系のライブラリ（数十 KB）は入れず、「打った文字が順番に含まれるか」と「近いほうを上に出す」だけを自作する（04.tech-stack/05-frontend.md）。
 * 日本語の見出しは単語境界が無いため、単語境界ボーナスは付けず連続と位置だけでスコアする。
 */
import type { OutlineItem } from '@/markdown/plugins/line-map';

/**
 * 部分列としての一致を測る。一致しなければ `null`。
 *
 * 大文字小文字は区別しない。コードポイント単位で見るので、
 * サロゲートペア（絵文字を含む見出し）でも壊れない。
 */
export function fuzzyScore(text: string, query: string): number | null {
  if (query === '') return 0;

  const haystack = text.toLowerCase();
  let cursor = 0;
  let previous = -2;
  let score = 0;

  for (const ch of query.toLowerCase()) {
    if (ch === ' ') continue; // 空白は「ここで区切った」という合図でしかない
    const at = haystack.indexOf(ch, cursor);
    if (at < 0) return null;

    // 連続していれば大きく加点。離れているほど点が下がる
    score += at === previous + 1 ? 8 : Math.max(1, 4 - (at - previous - 1));
    previous = at;
    cursor = at + 1;
  }

  // 見出しの先頭で当たったものを上に。長い見出しはわずかに下げる
  score += Math.max(0, 6 - cursor + 1);
  score -= text.length * 0.01;
  return score;
}

/**
 * 一致した見出しを、スコアの高い順に返す。
 *
 * 同点の場合は元の順序（文書内の並び）を維持する。
 * 空のクエリでは全件が文書順のまま返るため、開いた直後はアウトラインと同じ並びになる。
 *
 * 添字ではなく見出しそのものを返す。
 * 呼び出し側は `documentStore.outline` を持っており、添字を返すと 1 打鍵ごとに文字列の配列を作り直したうえで引き直すことになる。
 */
export function fuzzyFilter(items: readonly OutlineItem[], query: string): OutlineItem[] {
  const matches: { item: OutlineItem; index: number; score: number }[] = [];
  for (const [index, item] of items.entries()) {
    const score = fuzzyScore(item.text, query);
    if (score !== null) matches.push({ item, index, score });
  }
  const ordered = query === '' ? matches : matches.toSorted((a, b) => b.score - a.score || a.index - b.index);
  return ordered.map((match) => match.item);
}
