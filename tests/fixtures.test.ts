/**
 * 基準ファイルセットを、パイプラインに通す。
 *
 * `bench/fixtures/` の全ファイルでクラッシュしないことを確かめる。
 * 壊れる入力があることを、実測ではなくテストで先に検出する。
 *
 * ここで検証するのはパイプライン（パース → チャンク分割 → 文字数）だけで、サニタイズと描画は DOM が要るため別のテストで検証する。
 * 起動全体の確認は `scripts/bench-startup.mjs` で行う。
 *
 * 基準ファイルは Git 管理外（`pnpm fixtures` で生成する）。
 * 無いときは失敗ではなくスキップする。CI で毎回 10MB を作る意味はない。
 */
/// <reference types="node" />
// Node の型はこのファイルだけに入れる。`tsconfig.json` の `types` に `node` を追加すると `src/` 全体で `process` や `Buffer` が使えるようになり、ブラウザ側のコードに紛れ込みうる。

import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { render, renderChunks } from '@/markdown/pipeline';
import { DEFAULT_CHUNK_BLOCKS, DEFAULT_FIRST_CHUNK_BLOCKS } from '@/markdown/protocol';
import { measure } from '@/markdown/text-stats';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'bench', 'fixtures');

/** 基準ファイルセット。`gen-fixtures.mjs` が作るものと対応する。 */
const NAMES = ['tiny.md', 'readme.md', 'spec.md', 'diagram.md', 'math.md', 'huge.md', 'extreme.md'] as const;

function load(name: string): string | null {
  const path = join(FIXTURES, name);
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

const available = NAMES.filter((name) => existsSync(join(FIXTURES, name)));

describe.skipIf(available.length === 0)('基準ファイルセット', () => {
  it('すべて生成されている（`pnpm fixtures`）', () => {
    expect(available).toEqual([...NAMES]);
  });

  for (const name of NAMES) {
    describe(name, () => {
      const text = load(name);

      it.skipIf(text === null)('段階的描画の経路で落ちない', { timeout: 120_000 }, () => {
        const result = renderChunks(text!, DEFAULT_FIRST_CHUNK_BLOCKS, DEFAULT_CHUNK_BLOCKS);

        expect(result.chunks.length).toBeGreaterThan(0);
        // 最初のチャンクだけで「読み始められる」ことが段階的描画の前提（N-PERF-04）
        expect(result.chunks[0]).not.toBe('');
      });

      it.skipIf(text === null)('一括描画の経路でも落ちない', { timeout: 120_000 }, () => {
        expect(render(text!).html).not.toBe('');
      });

      it.skipIf(text === null)('文字数を数えられる', { timeout: 120_000 }, () => {
        const stats = measure(text!);
        expect(stats.chars).toBeGreaterThan(0);
        expect(stats.readingMinutes).toBeGreaterThan(0);
      });
    });
  }

  it('2MB は段階的に描ける（N-PERF-04）', () => {
    const text = load('huge.md');
    if (text === null) return;

    const result = renderChunks(text, DEFAULT_FIRST_CHUNK_BLOCKS, DEFAULT_CHUNK_BLOCKS);

    // 1 チャンクにまとまっていたら段階的描画が機能せず、最初の 1 画面が出るまで待たされる
    expect(result.chunks.length).toBeGreaterThan(1);
  }, 180_000);

  /**
   * 段階的描画は「トップレベルのブロックが複数ある」ことに依存している。
   *
   * `extreme.md` は 10MB 丸ごとが 1 つのコードフェンスなので、トップレベルのトークンが 1 つしかなく、チャンクに分割できない。
   * 要素の途中で分割すると HTML が壊れるため、分割しないのが正しい。
   *
   * つまりこの入力では N-PERF-04 の「段階的に表示される」は成立せず、性能目標の「クラッシュしない」だけが保証になる。
   * この線引きをテストとして残しておく。同じ性質の入力（巨大な表、巨大な 1 段落）でも同じことが起きる。
   */
  it('10MB の単一コードフェンスは割れない。それでも落ちない', () => {
    const text = load('extreme.md');
    if (text === null) return;

    expect(statSync(join(FIXTURES, 'extreme.md')).size).toBeGreaterThan(9_000_000);

    const result = renderChunks(text, DEFAULT_FIRST_CHUNK_BLOCKS, DEFAULT_CHUNK_BLOCKS);

    expect(result.chunks).toHaveLength(1);
    expect(result.chunks[0]).toContain('<code');
  }, 180_000);
});
