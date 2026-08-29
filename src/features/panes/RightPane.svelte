<!--
  ライトペイン（03.ux-spec/06-panes.md §3）。

  ```text
  ├────────────┬───────────────────────────────────┬─────────────┤
  │ EXPLORER   │                                   │ OUTLINE     │
  │ (M3)       │   本文                            │ (M1.5)      │
  ```

  # grid は作り直さない

  `shell.css` の `grid-template-areas` には最初から `leftpane` /
  `main` / `rightpane` の列がある。列幅は `auto` なので、**要素を置かなければ
  0 幅に潰れる**。このコンポーネントを 1 つ足すだけで 03.ux-spec/01-screen-layout.md §2 の展開状態になる。

  # 中身を知らない

  §4 の「ペイン」と「ビュー」の分離。ここが持つのは**枠と幅**だけで、
  中に何が入るかは知らない。将来アウトラインを左へ移すときに直すのは
  中身の 1 行だけになる。
-->
<script lang="ts">
  import Outline from '@/features/outline/Outline.svelte';
  import { viewStore } from '@/features/view/store.svelte';
  import { ja } from '@/i18n/ja';

  import { PANE_WIDTH_DEFAULT, PANE_WIDTH_MAX, PANE_WIDTH_MIN, setRightPaneWidth } from './panes';

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

  <Outline />
</aside>

<style>
  /*
   * 領域は名前で指す（`shell.css` の `grid-template-areas`）。
   * 幅はインラインスタイルで当たる。**トークンにしない**のは、
   * 左右で別々に記憶する値（§3）であり、片方だけを指す変数が
   * トークン層に 2 つ増えても意味が増えないため。
   *
   * # 開閉にアニメーションを付けない
   *
   * 03.ux-spec/09-motion.md の表は「サイドバー開閉 120ms」としているが、ここで `width` を
   * 遷移させると**本文全体の再レイアウトが毎フレーム走る**。`huge.md`（2MB）で
   * 目に見えて詰まる。性能予算（N-PERF-03）は Familiar（Design Brief §15）より
   * 先に満たすものなので、即座に開閉する。
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
