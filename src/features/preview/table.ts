/**
 * 表の幅を測り、見せ方を決める（F-VIEW-01）。
 *
 * 決めるのは 2 つで、どちらも CSS だけでは判定できない。
 *
 * 本文幅に収まらない表は、プレビューの幅いっぱいまで張り出させる（`data-mx-wide`）。
 * 収まる表まで張り出させると、2 列の表が画面の端から端まで伸びて、かえって読みにくくなる。
 *
 * 横に収まった表は、見出し行を `position: sticky` にする（`data-mx-fits`）。
 * sticky はスクロール容器の縦方向のスクロール量を基準に位置が決まるため、横スクロールする表では包む要素自身が基準になり、見出しが固定されない。
 * 収まる表だけ包む要素をスクロール容器から外し、基準を `.mx-preview` に戻す。
 *
 * 測るのは幅が変わったときだけで、タイマーは持たない（N-PERF-05）。
 */

/** 収まっていると見なす差。小数の丸めで 1px 未満の差が出る。 */
const TOLERANCE = 1;

/** 幅の変化だけに反応する。高さは属性の付け外し自体でも変わるため、見ると循環的な再計算になる。 */
let lastWidth = 0;

let observer: ResizeObserver | null = null;
let observed: HTMLElement | null = null;

/** はみ出しているか。`overflow-x` を持たない状態でも、はみ出した内容は `scrollWidth` に含まれる。 */
function overflows(table: HTMLElement): boolean {
  return table.scrollWidth - table.clientWidth > TOLERANCE;
}

/**
 * 表を測り直し、`data-mx-wide` / `data-mx-fits` / `data-mx-scrolls` を付け直す。
 *
 * 測る前はどれも付かない。
 * その状態を「横スクロールはできるが、端のフェードも sticky も無い」に割り当ててあり、測り終える前の 1 フレームで見た目が動かない。
 *
 * 読み取りと書き込みをまとめてあるのは、1 つ測るたびにレイアウトが再計算されるのを避けるため。
 * 表が 1 つも無ければ何もしない。
 */
export function measureTables(container: HTMLElement): void {
  const tables = [...container.querySelectorAll<HTMLElement>('.mx-table')];
  if (tables.length === 0) return;

  // 前回の結果を外してから測る。幅が縮んだときに、張り出した状態のまま測ることになるのを避ける。
  for (const table of tables) {
    delete table.dataset['mxWide'];
    delete table.dataset['mxFits'];
    delete table.dataset['mxScrolls'];
  }

  const wide = tables.map((table) => overflows(table));

  for (const [index, table] of tables.entries()) {
    if (wide[index]) table.dataset['mxWide'] = '';
  }

  // 張り出した表は幅が変わっているため、収まったかどうかをもう一度測る。
  const scrolls = tables.map((table, index) => wide[index] && overflows(table));

  for (const [index, table] of tables.entries()) {
    if (scrolls[index]) table.dataset['mxScrolls'] = '';
    else table.dataset['mxFits'] = '';
  }
}

/**
 * 幅の変化を監視して測り直す。文書を開くたびに呼ぶ。
 *
 * 監視するのは本文の領域 1 つだけである。
 * ペインの開閉・ウィンドウのリサイズ・倍率・本文幅の設定は、どれもここの幅の変化として現れる。
 */
export function observeTables(container: HTMLElement): void {
  measureTables(container);

  if (observed === container) return;
  observer?.disconnect();
  observed = container;
  lastWidth = container.clientWidth;

  observer ??= new ResizeObserver((entries) => {
    const width = entries[0]?.contentRect.width ?? 0;
    if (Math.abs(width - lastWidth) < TOLERANCE) return;
    lastWidth = width;
    if (observed) measureTables(observed);
  });

  observer.observe(container);
}

/**
 * 監視をやめる（N-PERF-06）。文書を閉じるときに呼ぶ。
 *
 * 常駐アプリであるため、閉じた文書のために監視が残り続けてはいけない。
 */
export function releaseTables(): void {
  observer?.disconnect();
  observer = null;
  observed = null;
  lastWidth = 0;
}
