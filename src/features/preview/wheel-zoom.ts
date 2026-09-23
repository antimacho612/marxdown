/**
 * Ctrl + マウスホイールによる表示倍率の変更（F-VIEW-11 / 03.ux-spec/04-keybindings.md §3 / issue #6）。
 *
 * 倍率そのものの適用は `zoom.ts` が担当し、ここはホイールの入力を刻みへ変換するだけである。
 * 適用先が Preview だけではない（エディターの font-size にも `--mx-zoom` が乗る）ため、登録先も特定の要素ではなく `window` にする。
 * `Ctrl+=` / `Ctrl+-` がどこでも効くのと同じ範囲になる。
 */
import { zoomIn, zoomOut } from './zoom';

/**
 * 1 段階動かすのに必要な蓄積量。
 * 標準的なホイールの 1 ノッチが `deltaY` 100 で届くため、1 ノッチがちょうど 1 段階になる。
 * タッチパッドのピンチは 1 回あたりの値が小さく届き、何度か重ねて 1 段階になる。
 */
const STEP_THRESHOLD = 100;

/** 行単位・ページ単位で届く `deltaY` をピクセル相当に直す係数。 */
const LINE_HEIGHT_PX = 16;
const PAGE_HEIGHT_PX = 400;

/** 段階に満たないぶんの持ち越し。ピンチのような細かい入力を取りこぼさないために保持する。 */
let accumulated = 0;

/**
 * Ctrl + ホイールを倍率の操作として受け取る。返り値を呼ぶと解除される。
 *
 * `passive: false` で登録する。
 * WebView 自身のページズームを止めないと、クロームごと拡大された上に `--mx-zoom` が二重に掛かる。
 * 修飾なしのホイールは最初の分岐で抜けるため、通常のスクロールに乗るコストは判定 1 回で済む。
 */
export function installWheelZoom(): () => void {
  const onWheel = (event: WheelEvent) => {
    // `metaKey` を Ctrl と同一視する理由は `lib/shortcuts.ts` と同じ（Windows が第一優先で、macOS でも動作させる）。
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();

    const delta = normalize(event);
    if (delta === 0) return;

    // 向きが変わったら持ち越しを捨てる。
    // 残しておくと、押し戻す操作が逆向きの蓄積を打ち消してから効き始め、最初の 1 ノッチが無反応になる。
    if (Math.sign(delta) !== Math.sign(accumulated)) accumulated = 0;
    accumulated += delta;

    // 1 イベントに複数段階ぶんの値が乗ることがあるため、消費しきるまで繰り返す。
    while (accumulated <= -STEP_THRESHOLD) {
      accumulated += STEP_THRESHOLD;
      zoomIn();
    }
    while (accumulated >= STEP_THRESHOLD) {
      accumulated -= STEP_THRESHOLD;
      zoomOut();
    }
  };

  globalThis.addEventListener('wheel', onWheel, { passive: false });
  return () => {
    globalThis.removeEventListener('wheel', onWheel);
    accumulated = 0;
  };
}

/** `deltaMode` の違いを吸収して、上方向が負のピクセル相当の値に揃える。 */
function normalize(event: WheelEvent): number {
  switch (event.deltaMode) {
    case WheelEvent.DOM_DELTA_LINE: {
      return event.deltaY * LINE_HEIGHT_PX;
    }
    case WheelEvent.DOM_DELTA_PAGE: {
      return event.deltaY * PAGE_HEIGHT_PX;
    }
    default: {
      return event.deltaY;
    }
  }
}
