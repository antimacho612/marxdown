import { beforeEach, describe, expect, it } from 'vitest';

import {
  canGoBack,
  canGoForward,
  historySnapshot,
  pushHistory,
  resetHistory,
  revertHistoryStep,
  stepHistory,
} from './history';

beforeEach(() => {
  resetHistory();
});

describe('リンク遷移の履歴 (F-NAV-07)', () => {
  it('何も開いていなければどちらへも動けない', () => {
    expect(canGoBack()).toBe(false);
    expect(canGoForward()).toBe(false);
    expect(stepHistory(-1, 0)).toBeNull();
  });

  it('1 枚目を開いただけでは戻れない', () => {
    pushHistory('a.md', 0);

    expect(canGoBack()).toBe(false);
    expect(canGoForward()).toBe(false);
  });

  it('辿った順に戻り、進める', () => {
    pushHistory('a.md', 0);
    pushHistory('b.md', 0);
    pushHistory('c.md', 0);

    expect(stepHistory(-1, 0)?.path).toBe('b.md');
    expect(stepHistory(-1, 0)?.path).toBe('a.md');
    expect(canGoBack()).toBe(false);
    expect(stepHistory(1, 0)?.path).toBe('b.md');
  });

  /** 06.roadmap.md §5.2「スクロール位置も一緒に戻す」。 */
  it('離れる直前のスクロール位置を憶えていて、戻ると返す', () => {
    pushHistory('a.md', 0);
    // a.md を 1200px スクロールしたところで b.md へ飛んだ
    pushHistory('b.md', 1200);

    expect(stepHistory(-1, 300)?.scrollTop).toBe(1200);
    // 戻る直前の b.md の位置も控えてある。進み直せば戻ってくる
    expect(stepHistory(1, 0)?.scrollTop).toBe(300);
  });

  it('戻ってから別の場所へ行くと、進む側は捨てられる', () => {
    pushHistory('a.md', 0);
    pushHistory('b.md', 0);
    stepHistory(-1, 0);

    pushHistory('c.md', 0);

    expect(canGoForward()).toBe(false);
    expect(historySnapshot().entries.map((e) => e.path)).toEqual(['a.md', 'c.md']);
  });

  it('同じファイルを開き直しても積まない', () => {
    pushHistory('a.md', 0);
    pushHistory('a.md', 500);

    expect(historySnapshot().entries).toHaveLength(1);
    expect(canGoBack()).toBe(false);
  });

  it('開けなかったときはカーソルを戻す（押した回数と段数を合わせる）', () => {
    pushHistory('a.md', 0);
    pushHistory('b.md', 0);

    stepHistory(-1, 0);
    revertHistoryStep(-1);

    expect(historySnapshot().cursor).toBe(1);
  });

  /** 常駐アプリ（ADR-0007）なので、際限なく伸びない。 */
  it('上限を超えたぶんは古いほうから捨てる', () => {
    for (let i = 0; i < 80; i++) pushHistory(`${i}.md`, 0);

    const { entries, cursor } = historySnapshot();
    expect(entries).toHaveLength(50);
    expect(entries[0]?.path).toBe('30.md');
    expect(cursor).toBe(49);
  });
});
