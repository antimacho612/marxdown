<!--
  ウィンドウ操作ボタン（03.ux-spec/01-screen-layout.md §1 / OQ-02 = B）。

  ```text
                                              ─  □  ✕
  ```

  **Windows の作法にそのまま合わせる。** 右上・`─ □ ✕` の順・幅 46px・
  閉じるのホバーだけ赤。ここは「Marxdown らしさ」を出す場所ではなく、
  ウィンドウを閉じ損ねない場所である（Principle 5「Familiar Over Novel」）。

  絵は `Mark.svelte` と同じくインライン SVG で持つ。Segoe Fluent Icons の
  グリフを使うと、フォントが無い環境で豆腐になる。**アイコンフォントに
  依存しない**のは、クリティカルパスにリクエストを増やさないためでもある。

  線幅 1px の直線だけで組んであるのは、この寸法（10px 角）では
  それ以外がぼやけるため。`shape-rendering` は既定のまま（`crispEdges` にすると
  高 DPI で線が消える）。
-->
<script lang="ts">
  import { viewStore } from '@/features/view/store.svelte';
  import { ja } from '@/i18n/ja';

  import { closeWindow, minimizeWindow, toggleMaximizeWindow, trackSnapLayoutsTarget } from './window';

  const maximized = $derived(viewStore.maximized);

  let maximizeButton: HTMLButtonElement;

  /*
   * 最大化ボタンの居場所を Rust へ知らせる（Windows の Snap Layouts）。
   *
   * ホバーでレイアウト選択のフライアウトを出すには、Windows に
   * 「ここが最大化ボタンだ」と答える必要がある（`snap_layouts.rs`）。
   * その代償として、その矩形には WebView のマウスイベントが届かなくなるので、
   * ホバーの塗りも Rust 側からの通知で行う（`viewStore.maximizeHovered`）。
   *
   * Windows 以外では通知が来ないだけで、素の `:hover` がそのまま効く。
   */
  $effect(() => trackSnapLayoutsTarget(maximizeButton));
</script>

<div class="mx-caption">
  <button
    type="button"
    class="mx-caption__button"
    aria-label={ja.titlebar.minimize}
    title={ja.titlebar.minimize}
    onclick={minimizeWindow}
  >
    <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true" focusable="false">
      <path d="M0 5h10" fill="none" stroke="currentColor" stroke-width="1" />
    </svg>
  </button>

  <!-- 最大化中は「元のサイズに戻す」。名前も絵も入れ替える（片方だけだと読み上げがずれる）。 -->
  <button
    type="button"
    class="mx-caption__button"
    class:mx-caption__button--hover={viewStore.maximizeHovered}
    bind:this={maximizeButton}
    aria-label={maximized ? ja.titlebar.restore : ja.titlebar.maximize}
    title={maximized ? ja.titlebar.restore : ja.titlebar.maximize}
    onclick={toggleMaximizeWindow}
  >
    {#if maximized}
      <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true" focusable="false">
        <g fill="none" stroke="currentColor" stroke-width="1">
          <path d="M2.5 2.5V0.5h7v7h-2" />
          <rect x="0.5" y="2.5" width="7" height="7" />
        </g>
      </svg>
    {:else}
      <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true" focusable="false">
        <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1" />
      </svg>
    {/if}
  </button>

  <button
    type="button"
    class="mx-caption__button mx-caption__button--close"
    aria-label={ja.titlebar.close}
    title={ja.titlebar.close}
    onclick={closeWindow}
  >
    <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true" focusable="false">
      <path d="M0.5 0.5l9 9M9.5 0.5l-9 9" fill="none" stroke="currentColor" stroke-width="1" />
    </svg>
  </button>
</div>

<style>
  .mx-caption {
    display: flex;
    align-self: stretch;
    flex: none;
  }

  /*
   * 角までいっぱいに押せることが Windows の作法。**内側に余白を作らない**。
   * 最大化中は画面の右上隅がそのまま「閉じる」になり、
   * マウスを放り投げるだけで閉じられる（Fitts の法則）。
   */
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

  /* キーボードで到達したときは、ホバーの塗りだけでは位置が分からない。 */
  .mx-caption__button:focus-visible {
    outline: 2px solid var(--mx-color-accent);
    outline-offset: -2px;
  }
</style>
