/**
 * 動きの共通処理。
 *
 * 見本の動きは画面に入っている間だけ動かし、外れたら止める。
 * 動きを減らす設定のときは、どの見本も終わりの状態のまま動かさない。
 */

const reducedQuery = globalThis.matchMedia('(prefers-reduced-motion: reduce)');

export function prefersReducedMotion(): boolean {
  return reducedQuery.matches;
}

/**
 * 中断できる待ち時間。見本が画面から外れたときに、進行中の演出をまとめて止めるために使う。
 */
export class Timeline {
  #controller = new AbortController();

  get signal(): AbortSignal {
    return this.#controller.signal;
  }

  get cancelled(): boolean {
    return this.#controller.signal.aborted;
  }

  /** 指定した時間だけ待つ。中断されたら `Cancelled` を投げる。 */
  async wait(ms: number): Promise<void> {
    const { signal } = this.#controller;
    if (signal.aborted) throw new Cancelled();
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, ms);
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          reject(new Cancelled());
        },
        { once: true },
      );
    });
  }

  cancel(): void {
    this.#controller.abort();
  }
}

/** `Timeline` が中断されたことを表す。呼び出し側では握りつぶしてよい。 */
export class Cancelled extends Error {
  constructor() {
    super('cancelled');
  }
}

/** 中断による例外だけを握りつぶして、演出を実行する。 */
export function play(run: () => Promise<void>): void {
  void (async () => {
    try {
      await run();
    } catch (error) {
      if (!(error instanceof Cancelled)) throw error;
    }
  })();
}

/**
 * 要素が画面に入っている間だけ呼ばれる処理を登録する。
 *
 * `enter` は入るたびに呼ばれ、返した関数は外れたときに呼ばれる。
 */
export function whileVisible(
  element: Element,
  enter: () => (() => void) | void,
  options?: IntersectionObserverInit,
): void {
  let leave: (() => void) | void;
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting && !leave) {
          leave = enter() ?? (() => {});
        } else if (!entry.isIntersecting && leave) {
          leave();
          leave = undefined;
        }
      }
    },
    options ?? { threshold: 0.35 },
  );
  observer.observe(element);
}

/** 1 文字ずつ打ち込む。打ち込む速さには揺らぎを付ける。 */
export async function typeInto(
  timeline: Timeline,
  target: HTMLElement,
  text: string,
  { delay = 45, jitter = 35 }: { delay?: number; jitter?: number } = {},
): Promise<void> {
  for (const char of text) {
    target.textContent += char;
    await timeline.wait(delay + Math.random() * jitter);
  }
}
