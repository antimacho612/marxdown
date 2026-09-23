/**
 * クイックオープンのあいまい検索にかかる時間（F-NAV-05 / 04.tech-stack/05-frontend.md）。
 *
 * 自作のあいまい検索で足りるか（1 打鍵 16ms 以内に収まるか）を判定するための数値を出す。
 *
 * 測るのは 1 打鍵ぶん、つまり `fuzzyFilter` を 1 回呼ぶ時間である。
 * 打鍵のたびに全件を走査するため、これが入力レスポンスそのものになる。
 *
 * ```bash
 * pnpm bench
 * ```
 */
import { bench, describe } from 'vitest';

import { fuzzyFilter } from '@/features/palette/lazy/fuzzy';

/**
 * それらしいファイル名を作る。
 *
 * 実在のリポジトリに似せる必要はない。影響するのは件数と 1 件あたりの長さで、一致しない候補を早く除外できるかどうかが時間を決める。
 */
function makePaths(count: number): { name: string }[] {
  const words = ['architecture', 'roadmap', 'design', 'notes', 'index', 'spec', 'memory', 'startup', 'tabs', 'panes'];
  return Array.from({ length: count }, (_, i) => ({
    name: `${words[i % words.length]}-${String(i).padStart(4, '0')}.md`,
  }));
}

const textOf = (item: { name: string }): string => item.name;

const cases = [
  [1000, '1000 件 — §1.1 の判定規模'],
  [5000, '5000 件 — 上限（`dir.rs` の MAX_FILES）'],
] as const;

for (const [count, label] of cases) {
  const items = makePaths(count);

  describe(label, () => {
    // 1 文字目。ほとんど絞り込めないため、並び替える件数が最も多くなる。
    bench('1 文字（"a"）', () => {
      fuzzyFilter(items, 'a', textOf);
    });

    // 打ち終わりに近い状態。照合は早く失敗するが、成功したものは全文字を辿る。
    bench('7 文字（"roadmap"）', () => {
      fuzzyFilter(items, 'roadmap', textOf);
    });

    // 1 件も一致しない。全件を最後まで照合する最悪ケース。
    bench('一致なし（"zzzzzz"）', () => {
      fuzzyFilter(items, 'zzzzzz', textOf);
    });
  });
}
