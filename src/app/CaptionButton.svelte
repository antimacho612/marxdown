<!--
@component
ウィンドウ操作ボタン 1 つ（03.ux-spec/01-screen-layout.md §1）。

Windows の作法にそのまま合わせる（幅 46px・閉じるのホバーのみ赤 / Principle 5「Familiar Over Novel」）。

角まで押せるよう、内側に余白を作らない。
最大化中は画面の右上隅がそのまま「閉じる」になり、端まで動かすだけで到達できる（Fitts の法則）。

アイコンは呼び出し側が `children` に置く（`<svg>` ごと渡す）。
-->

<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    /** 読み上げの名前とツールチップ。表示するのはアイコンだけであるため、両方をここから受け取る。 */
    label: string;
    /** 閉じるボタン。ホバー時だけ赤くなる（Windows の作法）。 */
    close?: boolean;
    /**
     * 外から与えるホバー。
     *
     * Snap Layouts の矩形（最大化ボタン）には WebView のマウスイベントが届かないため、`:hover` が動作しない。
     * Rust 側からの通知を受けて描画する（`app/window.ts` / `snap_layouts.rs`）。
     */
    hovered?: boolean;
    /** ボタンの実体。Snap Layouts の対象として登録する側だけが受け取る。 */
    element?: HTMLButtonElement | undefined;
    onClick: () => void;
    children: Snippet;
  }

  let { label, close = false, hovered = false, element = $bindable(), onClick, children }: Props = $props();
</script>

<button
  type="button"
  class="mx-caption__button"
  class:mx-caption__button--close={close}
  class:mx-caption__button--hover={hovered}
  bind:this={element}
  aria-label={label}
  title={label}
  onclick={onClick}
>
  {@render children()}
</button>

<style>
  .mx-caption__button {
    display: grid;
    place-items: center;
    width: var(--mx-caption-button-width);
    padding: 0;
    border: none;
    background: none;
    color: var(--mx-color-fg-muted);
    cursor: default;
  }

  .mx-caption__button:hover,
  .mx-caption__button--hover {
    background: var(--mx-color-bg-hover);
    color: var(--mx-color-fg);
  }

  .mx-caption__button:active {
    background: var(--mx-color-bg-inset);
  }

  .mx-caption__button--close:hover {
    background: var(--mx-color-caption-close);
    color: var(--mx-color-caption-close-fg);
  }

  .mx-caption__button--close:active {
    background: var(--mx-color-caption-close-active);
    color: var(--mx-color-caption-close-fg);
  }

  /* キーボードで到達したときは、ホバー時の背景色だけでは現在位置が判別できない。 */
  .mx-caption__button:focus-visible {
    outline: 2px solid var(--mx-color-accent);
    outline-offset: -2px;
  }
</style>
