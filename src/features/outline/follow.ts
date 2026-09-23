/**
 * 本文のスクロールに追従して「いまどの見出しの中にいるか」を決める（F-VIEW-02 / 03.ux-spec/06-panes.md §2）。
 *
 * `IntersectionObserver` を使う（N-PERF-05）。
 * `setInterval` はアイドル時も CPU を使い続け、`scroll` イベントはスクロール中しか発火せず全見出しの位置測り直しでレイアウトを強制する。
 * 本文の上端から 15% の帯を検出線とし、見出しの上端が越えたかを記録して「越えているものの最後」を現在位置とする。
 * 座標は交差時にブラウザが渡すため測定しない（レイアウト強制なし）。
 *
 * Edit では本文が `display: none` で交差が起きないため、エディターのカーソル行から求める（`headingAtLine`）。
 */
import type { OutlineItem } from '@/markdown/plugins/line-map';

/** 検出線の位置。本文の上端から何割か。 */
const DETECTION_LINE = 0.15;

const HEADING_SELECTOR = 'h1, h2, h3, h4, h5, h6';

/** 追従の操作。`followHeadings` が返す。 */
export interface OutlineFollower {
  /**
   * 見出しを集め直す。
   *
   * 段階的描画（02.architecture/06-markdown-rendering-pipeline.md §4）では、本文が idle 時に後から追加される。
   * 追加が完了した時点で呼び直さないと、後半の見出しが観測対象に入らない。
   */
  refresh: () => void;
  stop: () => void;
}

/**
 * 追従を始める。返り値の `stop()` で必ず止めること。
 *
 * ペインを閉じている間はこの関数が呼ばれないため、観測は 1 つも動作しない（アイドル時のコストが発生しない根拠）。
 *
 * @param container 本文のスクロールコンテナ（`#mx-preview`）
 * @param onActive 現在位置が変わったときに呼ばれる。見出しが 1 つも無ければ `-1`
 */
export function followHeadings(container: HTMLElement, onActive: (index: number) => void): OutlineFollower {
  // WebView2 / WKWebView には必ずある（04.tech-stack/08-typescript.md）。
  // 無いのはテスト環境（jsdom）だけなので、その場合は何もしない。
  if (typeof IntersectionObserver === 'undefined') {
    return { refresh: () => {}, stop: () => {} };
  }

  let indexOf = new WeakMap<Element, number>();
  /** 見出しごとの「検出線を越えたか」。文書順に並ぶ。 */
  let passed: boolean[] = [];
  let active = -1;

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const index = indexOf.get(entry.target);
        if (index === undefined) continue;
        const bounds = entry.rootBounds;
        // `rootBounds` は帯（root を下方向に縮めたもの）。その下端が検出線。
        passed[index] = bounds === null ? entry.isIntersecting : entry.boundingClientRect.top <= bounds.bottom;
      }
      emit();
    },
    {
      root: container,
      // 下辺を縮めて、root を「上端から 15% の帯」にする。
      rootMargin: `0px 0px -${(100 - DETECTION_LINE * 100).toFixed(0)}% 0px`,
      threshold: 0,
    },
  );

  function emit(): void {
    // 通過済みのもののうち最後のものが現在位置になる。
    // 文書順に単調であるため、末尾から探索して最初に見つかったものが該当する。
    let next = -1;
    for (let i = passed.length - 1; i >= 0; i--) {
      if (passed[i] === true) {
        next = i;
        break;
      }
    }
    if (next === active) return;
    active = next;
    onActive(next);
  }

  function refresh(): void {
    const headings = container.querySelectorAll<HTMLElement>(HEADING_SELECTOR);

    observer.disconnect();
    indexOf = new WeakMap();
    // 既に観測済みの見出しの状態は引き継ぐ。
    // 破棄すると、後半のチャンクが追加されるたびに現在位置が先頭へ戻る。
    // 観測を開始した直後に初回のコールバックが全要素ぶん届くため、引き継がなかった部分もすぐ更新される。
    passed = passed.slice(0, headings.length);

    for (const [index, heading] of headings.entries()) {
      indexOf.set(heading, index);
      observer.observe(heading);
    }
  }

  refresh();

  return {
    refresh,
    stop: () => observer.disconnect(),
  };
}

/**
 * その行を含む見出しの添字（Edit の現在位置）。
 *
 * 指定した行番号より手前にある最後の見出しが該当する。
 * 最初の見出しより前（Front Matter や前書き）にある間は `-1` を返す。その範囲はどの見出しにも含まれない。
 *
 * カーソル行を使うのは、Edit で見えているのがエディターだからで、VS Code のアウトラインが現在位置を示す基準と同じである。
 *
 * @param items アウトラインの項目。`line` は 0 始まり（`markdown/plugins/line-map.ts`）
 * @param line エディターのカーソル行。1 始まり
 */
export function headingAtLine(items: readonly OutlineItem[], line: number): number {
  let found = -1;
  for (const [index, item] of items.entries()) {
    if (item.line + 1 > line) break;
    found = index;
  }
  return found;
}
