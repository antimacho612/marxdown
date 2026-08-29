/**
 * markdown-it のパース + HTML 生成にかかる時間（05.performance-budget/04-targets.md §2）。
 *
 * DOM を含まない「パイプライン単体」の時間を測る。
 * DOM 込みの実測は起動計測ハーネス（T6→T8）の担当。
 *
 * ```bash
 * pnpm fixtures && pnpm bench
 * ```
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { bench, describe } from 'vitest';

import { render, renderChunks } from '@/markdown/pipeline';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

function load(name: string): string | null {
  const path = join(FIXTURES, name);
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

const cases = [
  ['tiny.md', '2KB — LLM の短い回答'],
  ['readme.md', '12KB — 最頻ケース'],
  ['spec.md', '120KB — 長い設計書'],
  ['huge.md', '2MB — 巨大ドキュメント'],
  ['extreme.md', '10MB — 単調なログ'],
] as const;

for (const [name, label] of cases) {
  const text = load(name);
  if (text === null) continue;

  // extreme.md は 1 回が数秒かかるため反復回数を絞る
  const heavy = text.length > 4 * 1024 * 1024;
  const options = heavy ? { iterations: 3, warmupIterations: 1, time: 0 } : {};

  describe(`${name} (${label})`, () => {
    bench(
      'render (一括)',
      () => {
        render(text);
      },
      options,
    );

    bench(
      'renderChunks (段階的)',
      () => {
        renderChunks(text, 40, 200);
      },
      options,
    );
  });
}

describe('段階的描画の最初のチャンクだけ', () => {
  const text = load('huge.md');
  if (text === null) return;

  // N-PERF-04「最初の 1 画面が見える」までの時間の下限を知るための計測。
  // 実際にはパース自体は全体に対して行われるので、ここで測れるのは
  // 「チャンク分割のオーバーヘッド」であって「最初の画面までの時間」ではない。
  // → この事実自体が S7 の判断材料になる。
  bench('先頭 40 ブロックで分割', () => {
    renderChunks(text, 40, 200);
  });
});
