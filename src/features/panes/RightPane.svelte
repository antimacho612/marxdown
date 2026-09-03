<!--
  ライトペイン（03.ux-spec/06-panes.md §3）。
  `shell.css` の `grid-template-areas` には最初から `rightpane` 列があり（列幅 `auto` で要素を置かなければ 0 幅に潰れる）、このコンポーネントを足すだけで展開状態になる。

  §4 の「ペイン」と「ビュー」の分離により、ここは枠と幅だけを持ち中身を知らない（中身はスニペットで `App.svelte` が渡す）。
  直接 `Outline` を import していた頃は `panes → outline → panes` の参照の輪ができていたため、この形にしてある。
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  import { viewStore } from '@/features/view/store.svelte';
  import { ja } from '@/i18n/ja';

  import { PANE_WIDTH_DEFAULT, PANE_WIDTH_MAX, PANE_WIDTH_MIN, setRightPaneWidth } from './panes';

  interface Props {
    /** ペインに入れるもの。**何であるかは、ここでは決めない。** */
    children: Snippet;
  }

  const { children }: Props = $props();

  /** キーボードでリサイズするときの刻み。ドラッグより粗くてよい。 */
  const KEY_STEP = 16;

  const width = $derived(viewStore.panes.right.width);

  /** ドラッグ開始時の位置と幅。ドラッグ中の 1 フレームごとに読むだけなので状態にしない。 */
  let dragFrom: { x: number; width: number } | null = null;
  /** rAF の予約。**間引かないと 1 フレームに複数回レイアウトが走る**。 */
  let pending = 0;

  function onPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    dragFrom = { x: event.clientX, width };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function onPointerMove(event: PointerEvent): void {
    const from = dragFrom;
    if (!from) return;

    // ペインは右端にあるので、左へ動かすほど広くなる。
    const next = from.width - (event.clientX - from.x);
    if (pending !== 0) return;
    pending = requestAnimationFrame(() => {
      pending = 0;
      // ドラッグ中は保存しない。離した時点で 1 回だけ書く（`panes.ts`）。
      setRightPaneWidth(next, false);
    });
  }

  function onPointerUp(event: PointerEvent): void {
    if (!dragFrom) return;
    dragFrom = null;
    (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
    if (pending !== 0) {
      cancelAnimationFrame(pending);
      pending = 0;
    }
    setRightPaneWidth(width);
  }

  /**
   * キーボードでも幅を変えられるようにする（03.ux-spec/10-accessibility.md）。
   *
   * 左右キーで幅を変え、`Home` で既定に戻す。
   * ポインタでしか触れない要素を増やさない。
   */
  function onKeyDown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowLeft': {
        setRightPaneWidth(width + KEY_STEP);
        break;
      }
      case 'ArrowRight': {
        setRightPaneWidth(width - KEY_STEP);
        break;
      }
      case 'Home': {
        setRightPaneWidth(PANE_WIDTH_DEFAULT);
        break;
      }
      default: {
        return;
      }
    }
    event.preventDefault();
  }
</script>

<aside class="mx-rightpane" style:width="{width}px">
  <!--
    掴む場所。ペインの左端に重ねてある。
    `aria-*` を付けているのは、キーボードで触れる以上、いまの幅が読めないと
    「増えたのか減ったのか」が分からないため。

    ロールが `separator` ではなく `slider` なのは、**フォーカスできる
    separator（ウィンドウスプリッタ）を Svelte の a11y 検査が
    「押せない要素」と見なす**ため。伝えたいこと（いくつからいくつの範囲の、
    いまいくつか）は slider のほうが素直に読み上げられる。
  -->
  <div
    class="mx-rightpane__resizer"
    role="slider"
    tabindex="0"
    aria-orientation="vertical"
    aria-label={ja.pane.resizeRight}
    aria-valuenow={width}
    aria-valuemin={PANE_WIDTH_MIN}
    aria-valuemax={PANE_WIDTH_MAX}
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerUp}
    ondblclick={() => setRightPaneWidth(PANE_WIDTH_DEFAULT)}
    onkeydown={onKeyDown}
  ></div>

  {@render children()}
</aside>

<style>
  /*
   * 領域は名前で指す（`shell.css` の `grid-template-areas`）。
   * 幅はインラインスタイルで当て、トークンにはしない（左右別々に記憶する値であり変数が増えても意味がないため）。
   * 開閉にアニメーションは付けない。
   * `width` を遷移させると本文全体の再レイアウトが毎フレーム走り、`huge.md` で処理が遅延するためである（N-PERF-03 / 03.ux-spec/09-motion.md §1）。
   */
  .mx-rightpane {
    grid-area: rightpane;
    position: relative;
    display: flex;
    flex-direction: column;
    min-height: 0;
    border-left: 1px solid var(--mx-color-border-subtle);
    background: var(--mx-color-bg-subtle);
    font-size: var(--mx-font-size-ui);
  }

  /*
   * 掴む場所は**見えないが太い**。境界線は 1px だが、1px を狙わせるのは操作として辛い。
   * ペインの外側（本文側）へはみ出させると本文のクリックを奪うので、内側に置く。
   */
  .mx-rightpane__resizer {
    position: absolute;
    inset-block: 0;
    inset-inline-start: 0;
    width: 5px;
    cursor: col-resize;
    /* 掴んだまま本文の上を通っても、テキスト選択を始めさせない */
    touch-action: none;
    user-select: none;
  }

  .mx-rightpane__resizer:hover,
  .mx-rightpane__resizer:focus-visible {
    outline: none;
    background: var(--mx-color-accent);
  }
</style>
