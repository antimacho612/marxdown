<!--
@component
「閉じる」の印。

インライン SVG にしてあるのは、記号文字（`✕` / U+2715）だと字形も大きさもフォント任せになるためである（`app/WindowControls.svelte` が Segoe Fluent Icons を避けているのと同じ理由）。
タブ・通知バー・設定ダイアログはこれを使う。

ウィンドウ操作の `✕` だけは別に持っている。
あちらは Windows の実寸（10px 角・線幅 1px）に合わせる必要があり、大きさを変えると OS の標準と見た目が変わる。
-->

<script lang="ts">
  interface Props {
    /** 一辺の長さ（px）。 */
    size?: number;
  }

  const { size = 12 }: Props = $props();
</script>

<svg viewBox="0 0 12 12" width={size} height={size} aria-hidden="true" focusable="false">
  <!-- NOTE: 端点を 3〜9 にしていたときは実寸 6px 未満になり、ウィンドウの閉じるボタン（9px）と並べると判別しにくかった。 -->
  <path d="M2 2l8 8M10 2l-8 8" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" />
</svg>
