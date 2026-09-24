import { describe, expect, it } from 'vitest';

import type { Ruler } from '@/platform';

import { createRulerMemory, rulerColumn } from './rulers';

const RED = { column: 100, color: '#ff000080' };

describe('縦罫線の色の引き継ぎ', () => {
  it('書き方によらず桁を取り出す', () => {
    expect([80, RED, { column: 120 }].map(rulerColumn)).toEqual([80, 100, 120]);
  });

  it('同じ桁は色付きの項目をそのまま使い、新しい桁は数値になる', () => {
    const memory = createRulerMemory();

    expect(memory.restore([100, 120], [80, RED])).toEqual([RED, 120]);
  });

  /** 1 打鍵ごとに反映されるため、打ち直しの途中でストアから色付きの項目が消える。 */
  it('打ち直しの途中で桁が変わっても、元の桁に戻れば色も戻る', () => {
    const memory = createRulerMemory();
    let current: Ruler[] = [80, RED];

    current = memory.restore([80, 10], current);
    expect(current).toEqual([80, 10]);

    current = memory.restore([80, 100], current);
    expect(current).toEqual([80, RED]);
  });

  it('外部で色を外した桁は、次の入力から数値になる', () => {
    const memory = createRulerMemory();
    memory.restore([100], [RED]);

    expect(memory.restore([100], [100])).toEqual([100]);
  });

  it('記憶を捨てた後は色を付けない', () => {
    const memory = createRulerMemory();
    memory.restore([100], [RED]);
    memory.forget();

    expect(memory.restore([100], [])).toEqual([100]);
  });
});
