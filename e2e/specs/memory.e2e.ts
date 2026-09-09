/**
 * 大きなドキュメントを開いて閉じるのを繰り返し、メモリが戻るか（[OQ-18](../../docs/07.open-questions/oq-18-memory-not-released.md) / M3 Phase 0）。
 *
 * `pnpm e2e` では走らない。`pnpm e2e:memory` で `wdio.memory.conf.ts` から明示的に呼ぶ（`wdio.conf.ts` の `exclude`）。
 * 分けているのは、`gc()` の露出と数分かかる待ちを他の 43 本に混ぜないためである。
 *
 * 判定はしない。
 * この spec が固定するのは「同じ手順で測り直せること」だけで、戻る / 戻らないの合否は M3 Phase 3 で入れる（[06.roadmap > m3 §2](../../docs/06.roadmap/m3-workspace.md)）。
 * 原因が分かっていない段階で赤にすると、ハーネスが壊れたのかアプリが漏らしたのかを取り違える。
 */
import { existsSync } from 'node:fs';
import path from 'node:path';

import { openViaForward } from '../helpers/app';
import {
  FIXTURES,
  forceGc,
  printReport,
  purgeJsMemory,
  sample,
  sampleProcessOnly,
  simulateMemoryPressure,
  waitForPaintSettled,
  writeReport,
  type MemorySample,
} from '../helpers/memory';

/** 開くファイルと、描かれたことを確かめる文字列（`scripts/gen-fixtures.mjs` の見出し）。 */
const TINY = { file: path.join(FIXTURES, 'tiny.md'), heading: 'tiny.md — LLM の短い回答を模したファイル' };
const HUGE = { file: path.join(FIXTURES, 'huge.md'), heading: 'huge.md — 生成された巨大ドキュメント' };

/** 解放が遅れているだけの可能性を残すためのアイドル。手で測ったときの 50 秒に合わせる。 */
const IDLE_MS = 60_000;

/**
 * 開いて戻すのを繰り返す回数。`MX_MEMORY_CYCLES` で変えられる。
 *
 * 1 往復では「戻らない分」が積算するのか 1 回きりの高水位なのかを区別できない。
 * M3 でタブが入ったときに枚数分だけ積み上がるかどうかは、ここでしか分からない（[06.roadmap > m3 §1.1](../../docs/06.roadmap/m3-workspace.md)）。
 * 頭打ちになるかを見るには回数が要るため、コードを書き換えずに増やせるようにしてある。
 */
const CYCLES = Number(process.env['MX_MEMORY_CYCLES'] ?? 3);

describe('メモリ（OQ-18）', () => {
  it('huge.md を描き切ってから tiny.md へ戻す往復を繰り返し、各点のメモリを記録する', async () => {
    for (const { file } of [TINY, HUGE]) {
      if (!existsSync(file)) throw new Error(`基準ファイルが無い: ${file}\n先に \`pnpm fixtures\` を実行すること。`);
    }

    const samples: MemorySample[] = [];

    await openViaForward(TINY.file, TINY.heading);
    await waitForPaintSettled();
    samples.push(await sample('baseline-tiny'));

    let blocks = 0;
    for (let cycle = 1; cycle <= CYCLES; cycle++) {
      // 描き切るまで待つ。
      // 途中で切り替えた場合の保持経路（`paint()` の打ち切り漏れ）は塞いであり、ここで見たいのはそれとは別の話である。
      await openViaForward(HUGE.file, HUGE.heading);
      blocks = await waitForPaintSettled();
      samples.push(await sample(`huge-painted-${cycle}`));

      await openViaForward(TINY.file, TINY.heading);
      await waitForPaintSettled();
      samples.push(await sample(`back-to-tiny-${cycle}`));

      await forceGc();
      samples.push(await sample(`after-gc-${cycle}`));
    }

    await browser.pause(IDLE_MS);
    samples.push(await sample('after-idle'));

    await simulateMemoryPressure();
    samples.push(await sample('after-pressure'));

    // 最後に置く。**この後はページ側を読めない**（`purgeJsMemory` の但し書き）。
    // 回収と「OS へ返す」を分けて見るためのもので、GC 後もプロセスが戻らない場合にどちらなのかがここで決まる。
    await purgeJsMemory();
    samples.push(sampleProcessOnly('after-purge'));

    printReport(samples);
    const report = writeReport(samples, { cycles: CYCLES, hugeBlocks: blocks, idleMs: IDLE_MS });

    // 計測できたことだけを固定する。`--enable-precise-memory-info` が効いていないと JS ヒープが動かず、切り分けにならない。
    expect(samples[0]?.jsHeapMB).not.toBe(null);
    expect(samples[1]?.jsHeapMB).toBeGreaterThan(samples[0]?.jsHeapMB ?? 0);
    console.log(`書き出した: ${report}`);
  });
});
