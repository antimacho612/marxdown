<!--
  レフトペイン（F-NAV-04）。
  `shell.css` の `grid-template-areas` には最初から `leftpane` 列があり（列幅 `auto` で要素を置かなければ幅 0 になる）、このコンポーネントを置くだけで展開状態になる。

  ライトペインと対称である。違うのはドラッグ領域の位置（右端）と、広がる向きだけである。
  ここは枠と幅だけを持ち、中身（ファイルツリー）は関知しない（中身はスニペットとして `App.svelte` が渡す）。
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  import { viewStore } from '@/features/view';
  import { t } from '@/i18n';

  import { PANE_WIDTH_DEFAULT, PANE_WIDTH_MAX, PANE_WIDTH_MIN, setLeftPaneWidth } from './panes';

  interface Props {
    /** ペインに表示する内容。何を表示するかはここでは決めない。 */
    children: Snippet;
  }

  const { children }: Props = $props();

  /** キーボードでリサイズするときの刻み。ドラッグより粗くてよい。 */
  const KEY_STEP = 16;

  const width = $derived(viewStore.panes.left.width);

  /** ドラッグ開始時の位置と幅。ドラッグ中の 1 フレームごとに読むだけなので状態にしない。 */
  let dragFrom: { x: number; width: number } | null = null;
  /** rAF の予約。間引かないと 1 フレームに複数回レイアウトが発生する。 */
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

    // ペインは左端にあるので、右へ動かすほど広くなる。
    const next = from.width + (event.clientX - from.x);
    if (pending !== 0) return;
    pending = requestAnimationFrame(() => {
      pending = 0;
      // ドラッグ中は保存しない。離した時点で 1 回だけ書く（`panes.ts`）。
      setLeftPaneWidth(next, false);
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
    setLeftPaneWidth(width);
  }

  /**
   * キーボードでも幅を変えられるようにする。
   *
   * 左右キーで幅を変え、`Home` で既定に戻す。
   * ポインタ操作でしか扱えない要素を増やさない。
   */
  function onKeyDown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowLeft': {
        setLeftPaneWidth(width - KEY_STEP);
        break;
      }
      case 'ArrowRight': {
        setLeftPaneWidth(width + KEY_STEP);
        break;
      }
      case 'Home': {
        setLeftPaneWidth(PANE_WIDTH_DEFAULT);
        break;
      }
      default: {
        return;
      }
    }
    event.preventDefault();
  }
</script>

<aside class="mx-leftpane" style:width="{width}px">
  <!--
    ドラッグ領域。ペインの右端に重ねてある。
    `aria-*` を付けているのは、キーボードで操作できる以上、現在の幅が読み上げられないと増減を判断できないためである。

    ロールが `separator` ではなく `slider` なのは、フォーカス可能な separator（ウィンドウスプリッタ）を Svelte の a11y 検査が操作できない要素と判定するためである。
    伝えたい内容（取りうる範囲と現在値）も slider のほうが読み上げに適している。
  -->
  <div
    class="mx-leftpane__resizer"
    role="slider"
    tabindex="0"
    aria-orientation="vertical"
    aria-label={t.pane.resizeLeft}
    aria-valuenow={width}
    aria-valuemin={PANE_WIDTH_MIN}
    aria-valuemax={PANE_WIDTH_MAX}
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerUp}
    ondblclick={() => setLeftPaneWidth(PANE_WIDTH_DEFAULT)}
    onkeydown={onKeyDown}
  ></div>

  {@render children()}
</aside>

<style>
  /*
   * 領域は名前で指す（`shell.css` の `grid-template-areas`）。
   * 幅はインラインスタイルで指定し、トークンにはしない（左右別々に記憶する値であり変数が増えても意味がないため）。
   * 開閉にアニメーションは付けない。
   * `width` を遷移させると本文全体の再レイアウトが毎フレーム発生し、`huge.md` で処理が遅延するためである（N-PERF-03）。
   */
  .mx-leftpane {
    grid-area: leftpane;
    position: relative;
    display: flex;
    flex-direction: column;
    min-height: 0;
    border-right: 1px solid var(--mx-color-border-subtle);
    background: var(--mx-color-bg-subtle);
    font-size: var(--mx-font-size-ui);
  }

  /*
   * ドラッグ領域は表示されないが、境界線の 1px より広く取る。
   * 1px を対象に操作させるのは難しいためである。
   * ペインの外側（本文側）へはみ出させると本文のクリックを妨げるため、内側に配置する。
   */
  .mx-leftpane__resizer {
    position: absolute;
    inset-block: 0;
    inset-inline-end: 0;
    width: 5px;
    cursor: col-resize;
    /* ドラッグ中に本文の上を通っても、テキスト選択を始めさせない */
    touch-action: none;
    user-select: none;
  }

  .mx-leftpane__resizer:hover,
  .mx-leftpane__resizer:focus-visible {
    outline: none;
    background: var(--mx-color-accent);
  }
</style>
