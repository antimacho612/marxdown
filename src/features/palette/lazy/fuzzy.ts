/**
 * あいまい検索（見出しジャンプ `Ctrl+Shift+O` / コマンドパレット `Ctrl+Shift+P`）。
 *
 * fzf 系のライブラリ（数十 KB）は入れず、「打った文字が順番に含まれるか」と「近いほうを上に出す」だけを自作する（04.tech-stack/05-frontend.md）。
 * 日本語には単語境界が無いため、単語境界ボーナスは付けず連続と位置だけでスコアする。
 *
 * パレットの遅延チャンクの中に置く。
 * `lib/` へ出すと、パレット以外から import された時点で共有チャンクへ切り出され、size-limit の critical path に含まれてしまう（`vite.config.ts` の `isPaletteOnly`）。
 * 使うのがパレットだけである限り、ここが正しい置き場所になる。
 *
 * クイックオープン（F-NAV-05）もここを使う。
 * 候補が 5000 件でも 1 打鍵の処理は 16ms を大きく下回る（04.tech-stack/05-frontend.md）。
 */

/** 正規化の対象になる文字（カタカナ / 全角の英数記号）。 */
const NORMALIZED = /[\u{30A1}-\u{30F6}\u{FF01}-\u{FF5E}]/gu;

/**
 * 照合用に字を揃える。カタカナをひらがなへ、全角の英数記号を半角へ揃え、大文字を小文字にする。
 *
 * 「ふぁいる」と打って「ファイル」に一致させるために必要である。
 * どの変換も 1 文字対 1 文字であり文字数が変わらないため、位置と連続で加点する側の前提を崩さない。
 *
 * 半角カタカナと `normalize('NFKC')` は対象外である。
 * NFKC は濁点付きの半角カタカナで文字数が変わるうえ、1 打鍵ごとに候補数ぶん実行するには処理が重い。
 * 長音符（`ー`）はひらがなでも同じ文字を使うため変換しない。
 */
function normalize(text: string): string {
  return text.toLowerCase().replace(NORMALIZED, (char) => {
    const code = char.charCodeAt(0);
    return String.fromCharCode(code - (code >= 0xff01 ? 0xfee0 : 0x60));
  });
}

/**
 * 部分列としての一致を測る。一致しなければ `null`。
 *
 * 大文字小文字・ひらがなとカタカナ・全角と半角は区別しない（`normalize`）。
 * コードポイント単位で見るので、サロゲートペア（絵文字を含む見出し）でも壊れない。
 */
export function fuzzyScore(text: string, query: string): number | null {
  if (query === '') return 0;

  const haystack = normalize(text);
  let cursor = 0;
  let previous = -2;
  let score = 0;

  for (const ch of normalize(query)) {
    if (ch === ' ') continue; // 空白は「ここで区切った」という合図でしかない
    const at = haystack.indexOf(ch, cursor);
    if (at < 0) return null;

    // 連続していれば大きく加点。離れているほど点が下がる
    score += at === previous + 1 ? 8 : Math.max(1, 4 - (at - previous - 1));
    previous = at;
    cursor = at + 1;
  }

  // 見出しの先頭で一致したものを上に。長い見出しはわずかに下げる
  score += Math.max(0, 6 - cursor + 1);
  score -= text.length * 0.01;
  return score;
}

/**
 * 一致したものを、スコアの高い順に返す。`keysOf` は照合する文字列をすべて取り出す。
 *
 * 先に書いたキーで一致したものが、後のキーで一致したものより常に上に来る。
 * コマンドパレットはラベルと英語キーワードの 2 つを渡しており、表示されている文字で一致したものが、表示されない別名でしか一致しないものより先に並ぶ。
 * 1 件が複数のキーで一致した場合は、最も先のキーでの一致だけを見る。
 *
 * 同点の場合は元の順序を維持する。
 * 空のクエリでは全件が元の並びのまま返るため、開いた直後は一覧と同じ並びになる。
 *
 * 添字ではなく要素そのものを返す。
 * 呼び出し側は元の配列を持っており、添字を返すと 1 打鍵ごとに引き直すことになる。
 */
export function fuzzyFilter<T>(items: readonly T[], query: string, keysOf: (item: T) => readonly string[]): T[] {
  const matches: { item: T; index: number; rank: number; score: number }[] = [];
  for (const [index, item] of items.entries()) {
    for (const [rank, key] of keysOf(item).entries()) {
      const score = fuzzyScore(key, query);
      if (score === null) continue;
      matches.push({ item, index, rank, score });
      break;
    }
  }
  const ordered =
    query === '' ? matches : matches.toSorted((a, b) => a.rank - b.rank || b.score - a.score || a.index - b.index);
  return ordered.map((match) => match.item);
}
