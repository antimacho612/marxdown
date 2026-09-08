/**
 * タブの開閉とメモリ（N-PERF-06 / M3 Phase 3）。
 *
 * **`memory.e2e.ts` とは別のセッションで走らせる。**
 * あちらは最後に `Memory.forciblyPurgeJavaScriptMemory` を呼んでおり、その後は
 * ページ側を読めない（`helpers/memory.ts`）。同じセッションに載せると、こちらが動かない。
 */
import path from 'node:path';

import { Key } from 'webdriverio';

import { openViaForward } from '../helpers/app';
import { WORK_DIR, writeFile } from '../helpers/fixtures';
import {
  FIXTURES,
  forceGc,
  printReport,
  sample,
  waitForPaintSettled,
  writeReport,
  type MemorySample,
} from '../helpers/memory';

/** 基準にする 1 枚（`scripts/gen-fixtures.mjs` の見出し）。 */
const TINY = { file: path.join(FIXTURES, 'tiny.md'), heading: 'tiny.md — LLM の短い回答を模したファイル' };

/**
 * 10 枚開いて全部閉じる（[05.performance-budget > operations §3](../../docs/05.performance-budget/05-operations.md)）。
 *
 * **判定には使えない。** WebDriver 経由の値は増分が信用できない（[measurements > caveats §3](../../docs/measurements/09-caveats.md)）。
 * ここで見るのは内訳である。JS ヒープ・DOM ノード・リスナが基準へ戻れば、こちら側の解放
 * （モデル・履歴・ウォッチャ）は効いていることになり、残りはアロケータの話になる。
 * 総量の判定は手計測で行う（`scripts/measure-tabs.ps1`）。
 */
describe('タブの開閉（N-PERF-06）', () => {
  const TABS = 10;

  it('10 枚開いて全部閉じたときの内訳を記録する', async () => {
    const samples: MemorySample[] = [];

    // 同じファイルは 2 枚のタブにならない（開いていれば切り替わる）ため、コピーを配る。
    const copies = Array.from({ length: TABS }, (_, i) =>
      path.join(WORK_DIR, `tab-${String(i + 1).padStart(2, '0')}.md`),
    );
    for (const [i, target] of copies.entries()) {
      writeFile(target, { content: `# tab ${i + 1}\n\n${'本文。'.repeat(200)}\n` });
    }

    await openViaForward(TINY.file, TINY.heading);
    await waitForPaintSettled();
    await forceGc();
    samples.push(await sample('baseline'));

    for (const [i, target] of copies.entries()) {
      await openViaForward(target, `tab ${i + 1}`);
    }
    samples.push(await sample(`opened-${TABS}`));

    for (let i = 0; i < TABS; i++) {
      await browser.keys([Key.Control, 'w']);
      await browser.pause(400);
    }
    samples.push(await sample('closed'));

    await forceGc();
    samples.push(await sample('closed-after-gc'));

    printReport(samples);
    writeReport(samples, { scenario: 'tabs', tabs: TABS }, 'memory-tabs.json');

    // 解放できていれば、DOM もリスナも基準へ戻る。**総量は見ない**（判定は手計測）。
    const baseline = samples[0];
    const after = samples[3];
    expect(after?.blinkNodes ?? 0).toBeLessThanOrEqual((baseline?.blinkNodes ?? 0) + 50);
    expect(after?.jsEventListeners ?? 0).toBeLessThanOrEqual((baseline?.jsEventListeners ?? 0) + 5);
  });
});
