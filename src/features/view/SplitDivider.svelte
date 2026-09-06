<!--
  Split の分割線（03.ux-spec/03-split-mode.md §1）。
  ライトペインのドラッグ領域（`panes/RightPane.svelte` の `__resizer`）と、ドラッグ・rAF による間引き・離した時点で 1 回だけ保存する構造が同じで、違うのは単位だけである（あちらは px、こちらは比）。
  `role="slider"` にしているのは、Svelte の a11y 検査が `separator` を操作できない要素と判定するためである。
-->
<script lang="ts">
  import { ja } from '@/i18n/ja';
  import { SPLIT_MAX, SPLIT_MIN } from '@/platform';

  import { resetSplit, setSplit } from './split';
  import { viewStore } from './store.svelte';

  /** キーボードで動かすときの刻み。ドラッグより粗くてよい。 */
  const KEY_STEP = 0.02;

  /** ドラッグ中の 1 フレームごとに読むだけなので、状態にしない。 */
  let dragging = false;
  let pending = 0;

  /** いまの比を百分率で。読み上げと `aria-valuenow` に使う。 */
  const percent = $derived(Math.round(viewStore.split * 100));

  /**
   * 分割線の位置から比を出す。
   *
   * ウィンドウ全体ではなく、左右のペインを除いた領域を基準に計算する。
   * ペインが開いているときに全体を基準にすると、ドラッグ位置と分割線がずれる。
   */
  function ratioAt(clientX: number, element: HTMLElement): number {
    const editor = document.querySelector('#mx-editor');
    const preview = document.querySelector('#mx-preview');
    if (!editor || !preview) return viewStore.split;

    const left = editor.getBoundingClientRect().left;
    const right = preview.getBoundingClientRect().right;
    const span = right - left - element.offsetWidth;
    if (span <= 0) return viewStore.split;

    return (clientX - left) / span;
  }

  function onPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    dragging = true;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function onPointerMove(event: PointerEvent): void {
    if (!dragging) return;
    const element = event.currentTarget as HTMLElement;
    const { clientX } = event;

    if (pending !== 0) return;
    pending = requestAnimationFrame(() => {
      pending = 0;
      // ドラッグ中は保存しない。離した時点で 1 回だけ書く（`split.ts`）。
      setSplit(ratioAt(clientX, element), false);
    });
  }

  function onPointerUp(event: PointerEvent): void {
    if (!dragging) return;
    dragging = false;
    (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
    if (pending !== 0) {
      cancelAnimationFrame(pending);
      pending = 0;
    }
    setSplit(viewStore.split);
  }

  function onKeyDown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowLeft': {
        setSplit(viewStore.split - KEY_STEP);
        break;
      }
      case 'ArrowRight': {
        setSplit(viewStore.split + KEY_STEP);
        break;
      }
      case 'Home': {
        resetSplit();
        break;
      }
      default: {
        return;
      }
    }
    event.preventDefault();
  }
</script>

<div
  class="mx-split-divider"
  role="slider"
  tabindex="0"
  aria-orientation="vertical"
  aria-label={ja.split.resize}
  aria-valuenow={percent}
  aria-valuemin={Math.round(SPLIT_MIN * 100)}
  aria-valuemax={Math.round(SPLIT_MAX * 100)}
  aria-valuetext={ja.split.ratio(percent)}
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onpointercancel={onPointerUp}
  ondblclick={resetSplit}
  onkeydown={onKeyDown}
></div>
