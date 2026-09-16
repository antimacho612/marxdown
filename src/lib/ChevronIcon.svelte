<!--
@component
開閉の三角。アウトラインの見出し行とファイルツリーが使う。

記号文字（`▸` / `▾`）を使わないのは、字形・大きさ・ベースラインがフォント任せになるためである。
実際、アウトラインでは 13px、ファイルツリーでは 10px で描かれており、同じ意味の印が別の大きさで並んでいた。

回転にアニメーションは付けない（03.ux-spec/09-motion.md の「サイドバー開閉 0ms」と同じ扱い）。
-->

<script lang="ts">
  interface Props {
    /** 展開しているか。閉じているときは右、開いているときは下を向く。 */
    expanded: boolean;
    /** 一辺の長さ（px）。 */
    size?: number;
  }

  const { expanded, size = 12 }: Props = $props();
</script>

<svg
  class="mx-chevron"
  class:mx-chevron--expanded={expanded}
  viewBox="0 0 12 12"
  width={size}
  height={size}
  aria-hidden="true"
  focusable="false"
>
  <path
    d="M4.5 2.5L8 6l-3.5 3.5"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
</svg>

<style>
  .mx-chevron {
    flex: none;
  }

  .mx-chevron--expanded {
    rotate: 90deg;
  }
</style>
