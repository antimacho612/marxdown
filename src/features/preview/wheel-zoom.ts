/**
 * Ctrl + マウスホイールによる表示倍率の変更（F-VIEW-11 / 03.ux-spec/04-keybindings.md §3）。
 *
 * 倍率そのものの適用は `zoom.ts` が担当し、ここはホイールの入力を刻みへ変換するだけである。
 * 適用先が Preview だけではない（エディターの font-size にも `--mx-zoom` が乗る）ため、登録先も特定の要素ではなく `window` にする。
 * `Ctrl+=` / `Ctrl+-` がどこでも有効なのと同じ範囲になる。
 */
import { zoomIn, zoomOut } from './zoom';

/**
 * 1 段階動かすのに必要な蓄積量であり、1 イベントが一度に寄与できる量の上限でもある。
 * 標準的なホイールの 1 ノッチは `deltaY` 100 で届くが、高解像度ホイールや一部のマウスドライバはこれを上回る値を 1 イベントで送ってくることがある。
 * 上限を設けずに蓄積すると、1 ノッチの操作で複数段階が一度に進んでしまう。
 * タッチパッドのピンチのように 1 回あたりの値が小さい入力は上限にかからず、何度か重ねて 1 段階になる。
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
 * 修飾なしのホイールは最初の分岐で抜けるため、通常のスクロールに加わるコストは判定 1 回で済む。
 */
export function installWheelZoom(): () => void {
  const onWheel = (event: WheelEvent) => {
    // `metaKey` を Ctrl と同一視する理由は `lib/shortcuts.ts` と同じ（Windows が第一優先で、macOS でも動作させる）。
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();

    const delta = normalize(event);
    if (delta === 0) return;

    // 上限を超えたぶんは捨てる。捨てずに蓄積すると、大きな `deltaY` を送ってくる環境で 1 ノッチの操作が複数段階として処理される。
    const clamped = Math.sign(delta) * Math.min(Math.abs(delta), STEP_THRESHOLD);

    // 向きが変わったら持ち越しを破棄する。
    // 残しておくと、押し戻す操作が逆向きの蓄積を打ち消してから反映され始め、最初の 1 ノッチが無反応になる。
    if (Math.sign(clamped) !== Math.sign(accumulated)) accumulated = 0;
    accumulated += clamped;

    // 前回までの持ち越しと今回のクランプ後の値を足しても 2 * STEP_THRESHOLD 未満のため、実際に進むのは高々 1 段階である。
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
