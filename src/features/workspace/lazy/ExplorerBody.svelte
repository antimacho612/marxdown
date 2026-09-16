<!--
  Explorer の中身（F-NAV-03 / 03.ux-spec/06-panes.md §1）。遅延チャンクの入口。

  `Explorer.svelte` の動的 import はここを指す。
  ツールバーとツリーを 1 つのチャンクにまとめてあり、ペインを開くと両方が同時に届く。

  ツールバーはスクロール領域の外に置く。
  中に入れると、木を下へ辿るたびに操作の入口が画面から流れていく。
-->
<script lang="ts">
  import ExplorerToolbar from './ExplorerToolbar.svelte';
  import FileTree from './FileTree.svelte';
</script>

<ExplorerToolbar />

<div class="mx-explorer__tree">
  <FileTree />
</div>

<style>
  .mx-explorer__tree {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }
</style>
