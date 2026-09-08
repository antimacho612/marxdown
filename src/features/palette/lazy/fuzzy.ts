/**
 * あいまい検索（見出しジャンプ `Ctrl+Shift+O` / コマンドパレット `Ctrl+Shift+P`）。
 *
 * fzf 系のライブラリ（数十 KB）は入れず、「打った文字が順番に含まれるか」と「近いほうを上に出す」だけを自作する（04.tech-stack/05-frontend.md）。
 * 日本語には単語境界が無いため、単語境界ボーナスは付けず連続と位置だけでスコアする。
 *
 * **パレットの遅延チャンクの中に置く。** `lib/` へ出すと、パレット以外から import された時点で
 * 共有チャンクへ切り出され、size-limit の critical path が拾ってしまう（`vite.config.ts` の
 * `isPaletteOnly`）。使うのがパレットだけである限り、ここが正しい置き場所になる。
 *
 * クイックオープン（F-NAV-05 / M3 Phase 6）もここを使う予定である。
 * 1000 ファイル規模で 1 打鍵 16ms を超えたら `fuzzysort` へ差し替える
 * （[06.roadmap > m3 §1.1](../../../../docs/06.roadmap/m3-workspace.md)）。
 */

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
 * 一致したものを、スコアの高い順に返す。`textOf` は照合する文字列を取り出す。
 *
 * 同点の場合は元の順序を維持する。
 * 空のクエリでは全件が元の並びのまま返るため、開いた直後は一覧と同じ並びになる。
 *
 * 添字ではなく要素そのものを返す。
 * 呼び出し側は元の配列を持っており、添字を返すと 1 打鍵ごとに引き直すことになる。
 */
export function fuzzyFilter<T>(items: readonly T[], query: string, textOf: (item: T) => string): T[] {
  const matches: { item: T; index: number; score: number }[] = [];
  for (const [index, item] of items.entries()) {
    const score = fuzzyScore(textOf(item), query);
    if (score !== null) matches.push({ item, index, score });
  }
  const ordered = query === '' ? matches : matches.toSorted((a, b) => b.score - a.score || a.index - b.index);
  return ordered.map((match) => match.item);
}
