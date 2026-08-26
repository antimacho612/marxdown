// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { followHeadings } from './follow';

/**
 * jsdom に `IntersectionObserver` は無い。
 *
 * ここで見たいのは「渡された交差情報から現在位置をどう決めるか」であって、
 * ブラウザが交差を検出できるかどうかではない。**交差そのものは手で流し込む。**
 */
interface FakeEntry {
  target: Element;
  /** 見出しの上端（root 座標系）。 */
  top: number;
}

/** 検出線。`follow.ts` の `DETECTION_LINE`（15%）× コンテナ高 400px。 */
const LINE = 60;

class FakeObserver {
  static latest: FakeObserver | null = null;

  callback: IntersectionObserverCallback;
  options: IntersectionObserverInit | undefined;
  observed: Element[] = [];
  disconnectCount = 0;

  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.callback = callback;
    this.options = options;
    FakeObserver.latest = this;
  }

  observe(target: Element): void {
    this.observed.push(target);
  }

  disconnect(): void {
    this.observed = [];
    this.disconnectCount++;
  }

  unobserve(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  /** ブラウザの代わりに交差を流し込む。 */
  emit(entries: FakeEntry[]): void {
    const payload = entries.map((entry) => ({
      target: entry.target,
      boundingClientRect: { top: entry.top } as DOMRectReadOnly,
      // 帯（root を下方向に縮めたもの）。下端が検出線。
      rootBounds: { top: 0, bottom: LINE } as DOMRectReadOnly,
      isIntersecting: entry.top >= 0 && entry.top <= LINE,
      intersectionRatio: 0,
      intersectionRect: {} as DOMRectReadOnly,
      time: 0,
    })) as unknown as IntersectionObserverEntry[];
    this.callback(payload, this as unknown as IntersectionObserver);
  }
}

let container: HTMLElement;
let active: number[];

/** 見出しを n 個並べた本文を作る。 */
function seed(count: number): HTMLElement[] {
  container.innerHTML = `<div class="mx-content">${Array.from(
    { length: count },
    (_, i) => `<h2 data-line="${i}">見出し ${i}</h2><p>本文</p>`,
  ).join('')}</div>`;
  return [...container.querySelectorAll('h2')];
}

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', FakeObserver);
  document.body.innerHTML = '<div id="mx-preview"></div>';
  container = document.querySelector('#mx-preview') as HTMLElement;
  active = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('アウトラインのスクロール追従 (03.ux-spec.md §7.2 / N-PERF-05)', () => {
  it('ポーリングではなく IntersectionObserver で見る', () => {
    seed(3);
    vi.useFakeTimers();

    const follower = followHeadings(container, (i) => active.push(i));

    // §7.2 が名指しで求めているのはこれ。タイマーを 1 本も足さない
    expect(vi.getTimerCount()).toBe(0);
    expect(FakeObserver.latest?.observed).toHaveLength(3);
    // 本文のスクロールコンテナを root にしないと、ウィンドウ基準で判定してしまう
    expect(FakeObserver.latest?.options?.root).toBe(container);

    follower.stop();
    vi.useRealTimers();
  });

  it('検出線を越えた最後の見出しが現在位置になる', () => {
    const headings = seed(3);
    followHeadings(container, (i) => active.push(i));
    const observer = FakeObserver.latest;

    // 先頭にいる状態。1 つ目だけが帯の中にいる
    observer?.emit([
      { target: headings[0] as Element, top: 10 },
      { target: headings[1] as Element, top: 300 },
      { target: headings[2] as Element, top: 700 },
    ]);
    expect(active.at(-1)).toBe(0);

    // 2 つ目が線を越えた
    observer?.emit([{ target: headings[1] as Element, top: 40 }]);
    expect(active.at(-1)).toBe(1);

    // 3 つ目も越えた。**最後に越えたものが現在位置**
    observer?.emit([{ target: headings[2] as Element, top: -20 }]);
    expect(active.at(-1)).toBe(2);
  });

  it('上へ戻ると現在位置も戻る', () => {
    const headings = seed(2);
    followHeadings(container, (i) => active.push(i));
    const observer = FakeObserver.latest;

    observer?.emit([
      { target: headings[0] as Element, top: -100 },
      { target: headings[1] as Element, top: 20 },
    ]);
    expect(active.at(-1)).toBe(1);

    // 2 つ目が線より下へ戻った
    observer?.emit([{ target: headings[1] as Element, top: 200 }]);
    expect(active.at(-1)).toBe(0);
  });

  it('同じ位置のままなら通知しない（無駄な再描画を起こさない）', () => {
    const headings = seed(2);
    followHeadings(container, (i) => active.push(i));
    const observer = FakeObserver.latest;

    observer?.emit([{ target: headings[0] as Element, top: 10 }]);
    observer?.emit([{ target: headings[0] as Element, top: 5 }]);
    observer?.emit([{ target: headings[0] as Element, top: 0 }]);

    expect(active).toEqual([0]);
  });

  /**
   * 段階的描画（02.architecture.md §6.4）。
   * 後から入ったチャンクの見出しを観測しないと、後半で追従が止まる。
   */
  it('後から増えた見出しを refresh で拾い、現在位置を先頭へ跳ね返さない', () => {
    const headings = seed(2);
    const follower = followHeadings(container, (i) => active.push(i));

    FakeObserver.latest?.emit([
      { target: headings[0] as Element, top: -100 },
      { target: headings[1] as Element, top: 10 },
    ]);
    expect(active.at(-1)).toBe(1);

    // 残りのチャンクが入った
    const content = container.querySelector('.mx-content') as HTMLElement;
    content.insertAdjacentHTML('beforeend', '<h2 data-line="9">後から来た見出し</h2>');
    follower.refresh();

    expect(FakeObserver.latest?.observed).toHaveLength(3);
    // 観測し直しただけで現在位置は動かない
    expect(active.at(-1)).toBe(1);
  });

  it('stop で観測をやめる（ペインを閉じたらコストがゼロになる）', () => {
    seed(3);
    const follower = followHeadings(container, (i) => active.push(i));

    follower.stop();

    expect(FakeObserver.latest?.observed).toHaveLength(0);
  });

  it('見出しが数百個でも観測は 1 つだけ', () => {
    seed(400);
    followHeadings(container, (i) => active.push(i));

    expect(FakeObserver.latest?.observed).toHaveLength(400);
    // **観測者は 1 つ。** 見出しごとに作ると、その数だけコールバックが走る
    expect(FakeObserver.latest?.disconnectCount).toBe(1);
  });
});
