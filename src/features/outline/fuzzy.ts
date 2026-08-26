/**
 * 見出しのあいまい検索（`Ctrl+Shift+O` / 03.ux-spec.md §5.3「移動」）。
 *
 * **このモジュールは遅延チャンク側**（`open-jump.ts` から先）にある。
 * 一度も見出しジャンプを使わない人のために、これを起動時に読ませない。
 *
 * # ライブラリを入れない
 *
 * fzf 系のスコアリングを持つパッケージはどれも数十 KB あり、
 * ここで欲しいのは「打った文字が順番に含まれるか」と「近いほうを上に出す」だけ。
 * 04.tech-stack.md §5 の判断基準（自分で書くと数十行で済むものは入れない）に従う。
 *
 * # 日本語の見出しを前提にする
 *
 * 単語境界のボーナスは付けない。`## 起動シーケンス` に空白は無く、
 * 英語向けの規則を持ち込んでも順位が良くならない。効くのは**連続**と**位置**の 2 つ。
 */

export interface FuzzyMatch {
  /** 元の配列での添字。 */
  index: number;
  score: number;
}

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
 * 一致した項目を、スコアの高い順に返す。
 *
 * 同点は**元の順序**（＝文書内の並び）で決める。空クエリでは全件が
 * 文書順のまま返るので、開いた直後は「アウトラインそのもの」に見える。
 */
export function fuzzyFilter(texts: readonly string[], query: string): FuzzyMatch[] {
  const matches: FuzzyMatch[] = [];
  for (const [index, text] of texts.entries()) {
    const score = fuzzyScore(text, query);
    if (score !== null) matches.push({ index, score });
  }
  if (query === '') return matches;
  return matches.toSorted((a, b) => b.score - a.score || a.index - b.index);
}
