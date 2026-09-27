/**
 * `|` 記法の読み書き。エディターエンジンを一切知らない。
 *
 * 書式コマンドの正しさは「どの文字が入ったか」と「カーソルがどこへ行ったか」の両方で決まる。
 * 位置を数値で書くと期待値が読めなくなるため、`|` で書く（例: `'- a|'` はカーソルが `a` の後ろ、`'|word|'` は `word` を選択）。
 * `|` は 1 つならカーソル、2 つなら選択範囲。
 * 入力も期待値も同じ書き方になる。
 *
 * 書式コマンドのテストはすべてこの表記で書く。
 * エンジンを差し替えても（ADR-0009）、期待値の書き方まで書き直す理由は無く、エンジンに依存するのは `editor-harness.ts` の側だけにしてある。
 *
 * `src/` の外に置いてあるのは、`src/features/editor/` に置くと `vite.config.ts` の `chunkFileNames` が `editor` チャンクの一部として扱うためである。
 * 実際にバンドルされることは無い（製品コードからは誰も import しない）が、予算を検証する対象の中にテスト専用のコードを置かない。
 */

/** カーソル（`from === to`）または選択範囲。位置は `doc` に対する文字数。 */
export interface MarkedRange {
  from: number;
  to: number;
}

/**
 * `|` を取り除き、位置に変換する。
 *
 * `|` が 0 個なら先頭のカーソル。以降は 2 つで 1 つの選択範囲としてまとめ、余った 1 つはカーソルとして扱う。複数カーソルもこの形で書ける。
 */
export function parseMarks(source: string): { doc: string; ranges: MarkedRange[] } {
  const positions: number[] = [];
  let doc = '';

  for (const char of source) {
    if (char === '|') positions.push(doc.length);
    else doc += char;
  }

  if (positions.length === 0) return { doc, ranges: [{ from: 0, to: 0 }] };

  const ranges: MarkedRange[] = [];
  for (let i = 0; i < positions.length; i += 2) {
    const from = positions[i] ?? 0;
    ranges.push({ from, to: positions[i + 1] ?? from });
  }

  return { doc, ranges };
}

/**
 * カーソルと選択範囲を `|` に戻す。
 *
 * 後ろから入れる。
 * 前から入れると、挿入した `|` のぶんだけ後続の位置がずれる。
 */
export function printMarks(doc: string, ranges: readonly MarkedRange[]): string {
  const marks = ranges
    .flatMap((range) => (range.from === range.to ? [range.from] : [range.from, range.to]))
    .toSorted((a, b) => b - a);

  let out = doc;
  for (const at of marks) out = `${out.slice(0, at)}|${out.slice(at)}`;
  return out;
}
