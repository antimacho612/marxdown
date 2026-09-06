<!--
  ウィンドウ操作ボタン（03.ux-spec/01-screen-layout.md §1）。
  Windows の作法にそのまま合わせる（右上・`─ □ ✕` の順・幅 46px・閉じるのホバーのみ赤 / Principle 5「Familiar Over Novel」）。
  アイコンはインライン SVG である（Segoe Fluent Icons を使うと、フォントが無い環境で文字化けする）。
  10px 角の寸法では線幅 1px の直線以外は輪郭がぼやけるため、`shape-rendering` は既定のままにしている（`crispEdges` にすると高 DPI 環境で線が表示されなくなる）。
  ボタン 1 つぶんの見た目と挙動は `CaptionButton.svelte` が持つ。ここが決めるのは並びとアイコンだけである。
-->
<script lang="ts">
  import { viewStore } from '@/features/view';
  import { ja } from '@/i18n/ja';

  import CaptionButton from './CaptionButton.svelte';
  import { closeWindow, minimizeWindow, toggleMaximizeWindow, trackSnapLayoutsTarget } from './window';

  const maximized = $derived(viewStore.maximized);

  let maximizeButton = $state<HTMLButtonElement>();

  /*
   * 最大化ボタンの位置を Rust へ通知する（Windows の Snap Layouts）。
   *
   * ホバーでレイアウト選択のフライアウトを表示するには、最大化ボタンの位置を Windows へ応答する必要がある（`snap_layouts.rs`）。
   * その結果、その矩形には WebView のマウスイベントが届かなくなるため、ホバーの描画も Rust 側からの通知で行う（`viewStore.maximizeHovered`）。
   *
   * Windows 以外では通知が来ないだけで、`:hover` がそのまま動作する。
   *
   * ここでは矩形を測定しない。
   * マウント直後の `getBoundingClientRect()` はスタイル再計算とレイアウトを同期的に実行し、起動を 32〜35ms 遅らせる（OQ-30 / `window.ts`）。
   * ここで行うのは対象の登録と `resize` の監視だけで、初回の報告は `ready()` の後に行われる。
   */
  $effect(() => {
    if (!maximizeButton) return;
    return trackSnapLayoutsTarget(maximizeButton);
  });
</script>

<div class="mx-caption">
  <CaptionButton label={ja.titlebar.minimize} onClick={minimizeWindow}>
    <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true" focusable="false">
      <path d="M0 5h10" fill="none" stroke="currentColor" stroke-width="1" />
    </svg>
  </CaptionButton>

  <!-- 最大化中は「元のサイズに戻す」になる。名前とアイコンの両方を入れ替える（片方だけだと読み上げと表示が一致しない）。 -->
  <CaptionButton
    label={maximized ? ja.titlebar.restore : ja.titlebar.maximize}
    hovered={viewStore.maximizeHovered}
    bind:element={maximizeButton}
    onClick={toggleMaximizeWindow}
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
  </CaptionButton>

  <CaptionButton close label={ja.titlebar.close} onClick={closeWindow}>
    <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true" focusable="false">
      <path d="M0.5 0.5l9 9M9.5 0.5l-9 9" fill="none" stroke="currentColor" stroke-width="1" />
    </svg>
  </CaptionButton>
</div>

<style>
  .mx-caption {
    display: flex;
    align-self: stretch;
    flex: none;
  }
</style>
