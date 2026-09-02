/**
 * 本文のスクロールに追従して「いまどの見出しの中にいるか」を決める
 * （F-VIEW-02 / 03.ux-spec/06-panes.md §2）。
 *
 * # `setInterval` を使わない
 *
 * §2 が名指しで **`IntersectionObserver` を使うこと**を求めている（N-PERF-05）。
 * ポーリングにすると、読んでいるだけの時間にも CPU を使い続ける。常駐アプリ
 * （ADR-0007）では、それが 8 時間そのまま積算する。
 *
 * `scroll` イベントを見る手もあるが、こちらは**スクロール中しか発火しない**
 * うえに、1 回ごとに全見出しの位置を測り直す（＝レイアウトを強制する）。
 * `huge.md` の見出し数百個でそれをやると、スクロール自体が詰まる。
 *
 * # 「通り過ぎたか」を境界の交差だけで判定する
 *
 * 本文の上端から 15% の帯を検出線に見立て、**見出しの上端がその帯の下端を
 * 越えたか**を各見出しについて覚えておく。あとは「越えているものの最後」が
 * 現在位置になる。
 *
 * ```text
 * ┌──────────────── #mx-preview ────────────────┐
 * │ ## 設計          ← 越えている（passed）      │
 * ├ ─ ─ ─ ─ ─ 検出線（上端から 15%）─ ─ ─ ─ ─ ─ ┤
 * │ ## 実装          ← まだ越えていない          │
 * │                                              │
 * └──────────────────────────────────────────────┘
 *   → 現在位置は「設計」
 * ```
 *
 * 判定に必要な座標は**交差が起きた瞬間にブラウザが渡してくる**
 * （`boundingClientRect` / `rootBounds`）ので、こちらから測りに行かない。
 * つまりレイアウトを強制する箇所が 1 つも無い。
 *
 * # Edit では追う相手が違う
 *
 * 本文の面が `display: none` にあるあいだ、交差は一度も起きない。**観測しても
 * 現在位置は分からない**（隠れた要素の矩形は全部 0 で届き、「全部が検出線を
 * 越えている」と読めてしまう / #59）。見えているのはエディタのほうなので、
 * そちらではカーソル行から引く（`headingAtLine`）。
 */
import type { OutlineItem } from '@/markdown/plugins/line-map';

/** 検出線の位置。本文の上端から何割か。 */
const DETECTION_LINE = 0.15;

const HEADING_SELECTOR = 'h1, h2, h3, h4, h5, h6';

export interface OutlineFollower {
  /**
   * 見出しを集め直す。
   *
   * 段階的描画（02.architecture/06-markdown-rendering-pipeline.md §4）では、本文は idle 時に後から増える。
   * 増え終わったところで呼び直さないと、後半の見出しを一生観測しない。
   */
  refresh: () => void;
  stop: () => void;
}

/**
 * 追従を始める。返り値の `stop()` で必ず止めること。
 *
 * ペインを閉じている間は誰も呼ばないので、**観測は 1 つも動いていない**
 * （アイドル時のコストがゼロであることの根拠）。
 *
 * @param container 本文のスクロールコンテナ（`#mx-preview`）
 * @param onActive 現在位置が変わったときに呼ばれる。見出しが 1 つも無ければ `-1`
 */
export function followHeadings(container: HTMLElement, onActive: (index: number) => void): OutlineFollower {
  // WebView2 / WKWebView には必ずある（04.tech-stack/08-typescript.md）。
  // 無いのはテスト環境（jsdom）だけなので、その場合は静かに何もしない。
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
    // 越えているものの**最後**が現在位置。文書順に単調なので、
    // 後ろから見て最初に見つかったものが答えになる。
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
    // 既に観測済みだった見出しの状態は引き継ぐ。**捨てると、後半のチャンクが
    // 入るたびに現在位置が先頭へ跳ね返る。** 観測を始めた直後に初回のコールバックが
    // 全要素ぶん届くので、引き継がなかった部分もすぐ埋まる。
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
 * その行を含む見出しの添字（Edit の現在位置 / #59）。
 *
 * **行番号より手前にある最後の見出し**が答えになる。見出しより前
 * （Front Matter / 前書き）に居るあいだは `-1`。そこはどの見出しの中でもない。
 *
 * カーソル行を使うのは、Edit で見えているのがエディタだからで、
 * VS Code のアウトラインが現在位置を示す基準と同じである。
 *
 * @param items アウトラインの項目。`line` は 0 始まり（`markdown/plugins/line-map.ts`）
 * @param line エディタのカーソル行。**1 始まり**
 */
export function headingAtLine(items: readonly OutlineItem[], line: number): number {
  let found = -1;
  for (const [index, item] of items.entries()) {
    if (item.line + 1 > line) break;
    found = index;
  }
  return found;
}
