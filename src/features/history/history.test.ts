import { beforeEach, describe, expect, it } from 'vitest';

import {
  canGoBack,
  canGoForward,
  dropHistory,
  historySnapshot,
  pushHistory,
  resetHistory,
  revertHistoryStep,
  stepHistory,
} from './history';

/** タブ 1 枚ぶんの履歴を見る。タブをまたぐ場合だけ別のキーを使う。 */
const TAB = 1;

beforeEach(() => {
  resetHistory();
});

describe('リンク遷移の履歴 (F-NAV-07)', () => {
  it('何も開いていなければどちらへも動けない', () => {
    expect(canGoBack(TAB)).toBe(false);
    expect(canGoForward(TAB)).toBe(false);
    expect(stepHistory(TAB, -1, 0)).toBeNull();
  });

  it('1 枚目を開いただけでは戻れない', () => {
    pushHistory(TAB, 'a.md', 0);

    expect(canGoBack(TAB)).toBe(false);
    expect(canGoForward(TAB)).toBe(false);
  });

  it('辿った順に戻り、進める', () => {
    pushHistory(TAB, 'a.md', 0);
    pushHistory(TAB, 'b.md', 0);
    pushHistory(TAB, 'c.md', 0);

    expect(stepHistory(TAB, -1, 0)?.path).toBe('b.md');
    expect(stepHistory(TAB, -1, 0)?.path).toBe('a.md');
    expect(canGoBack(TAB)).toBe(false);
    expect(stepHistory(TAB, 1, 0)?.path).toBe('b.md');
  });

  /** F-NAV-07。スクロール位置も一緒に戻す。 */
  it('離れる直前のスクロール位置を憶えていて、戻ると返す', () => {
    pushHistory(TAB, 'a.md', 0);
    // a.md を 1200px スクロールしたところで b.md へ移動した
    pushHistory(TAB, 'b.md', 1200);

    expect(stepHistory(TAB, -1, 300)?.scrollTop).toBe(1200);
    // 戻る直前の b.md の位置も記録してある。進み直せば戻ってくる
    expect(stepHistory(TAB, 1, 0)?.scrollTop).toBe(300);
  });

  it('戻ってから別の場所へ行くと、進む側は捨てられる', () => {
    pushHistory(TAB, 'a.md', 0);
    pushHistory(TAB, 'b.md', 0);
    stepHistory(TAB, -1, 0);

    pushHistory(TAB, 'c.md', 0);

    expect(canGoForward(TAB)).toBe(false);
    expect(historySnapshot(TAB).entries.map((e) => e.path)).toEqual(['a.md', 'c.md']);
  });

  it('同じファイルを開き直しても積まない', () => {
    pushHistory(TAB, 'a.md', 0);
    pushHistory(TAB, 'a.md', 500);

    expect(historySnapshot(TAB).entries).toHaveLength(1);
    expect(canGoBack(TAB)).toBe(false);
  });

  it('開けなかったときはカーソルを戻す（押した回数と段数を合わせる）', () => {
    pushHistory(TAB, 'a.md', 0);
    pushHistory(TAB, 'b.md', 0);

    stepHistory(TAB, -1, 0);
    revertHistoryStep(TAB, -1);

    expect(historySnapshot(TAB).cursor).toBe(1);
  });

  /** 常駐アプリ（ADR-0007）なので、際限なく伸びない。 */
  it('上限を超えたぶんは古いほうから捨てる', () => {
    for (let i = 0; i < 80; i++) pushHistory(TAB, `${i}.md`, 0);

    const { entries, cursor } = historySnapshot(TAB);
    expect(entries).toHaveLength(50);
    expect(entries[0]?.path).toBe('30.md');
    expect(cursor).toBe(49);
  });
});

describe('タブごとに分かれる', () => {
  it('別のタブの履歴は混ざらない', () => {
    pushHistory(1, 'a.md', 0);
    pushHistory(1, 'b.md', 0);
    pushHistory(2, 'x.md', 0);

    // タブ 2 は 1 枚目を開いただけなので戻れない。
    expect(canGoBack(2)).toBe(false);
    expect(canGoBack(1)).toBe(true);
    expect(stepHistory(1, -1, 0)?.path).toBe('a.md');
  });

  it('閉じたタブの履歴は捨てる', () => {
    pushHistory(1, 'a.md', 0);
    pushHistory(1, 'b.md', 0);

    dropHistory(1);

    expect(canGoBack(1)).toBe(false);
    expect(historySnapshot(1).entries).toEqual([]);
  });
});
