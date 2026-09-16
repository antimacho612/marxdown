<!--
@component
「閉じる」の印。

インライン SVG にしてあるのは、記号文字（`✕` / U+2715）だと字形も大きさもフォント任せになるためである
（`app/WindowControls.svelte` が Segoe Fluent Icons を避けているのと同じ理由）。
タブ・通知バー・設定ダイアログはこれを使う。

ウィンドウ操作の `✕` だけは別に持っている。
あちらは Windows の実寸（10px 角・線幅 1px）に合わせる必要があり、大きさを変えると手触りが OS と違う。
-->

<script lang="ts">
  interface Props {
    /** 一辺の長さ（px）。 */
    size?: number;
  }

  const { size = 12 }: Props = $props();
</script>

<svg viewBox="0 0 12 12" width={size} height={size} aria-hidden="true" focusable="false">
  <path d="M3 3l6 6M9 3l-6 6" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" />
</svg>
