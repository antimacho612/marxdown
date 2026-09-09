<!--
  レフトペインの中身（F-NAV-03）。**動的 import の 1 行だけを持つ。**

  ファイルツリー本体は遅延チャンクにあり、ペインを開くまで読み込まない
  （クリティカルパスの外 / 05.performance-budget）。`open-editor.ts` などと同じ形で、
  ここに置いても `workspace` の他の部分は `main` に残る。
-->
<script lang="ts">
  import { documentStore } from '@/features/document';
  import { ja } from '@/i18n/ja';

  import { setTreeRootFromFile, treeStore } from './tree.svelte';

  const path = $derived(documentStore.meta?.path ?? null);

  /**
   * 開いているファイルに合わせて基点を決める。
   *
   * `marxdown <dir>` で基点が決まっている場合は上書きしない（そちらが優先 / F-OPEN-02）。
   * ペインが閉じている間はこのコンポーネント自体が存在しないため、読み込みも起きない。
   */
  $effect(() => {
    if (treeStore.root === null) void setTreeRootFromFile(path);
  });
</script>

{#if treeStore.root === null}
  <p class="mx-explorer__note">{ja.tree.noRoot}</p>
{:else}
  {#await import('./lazy/FileTree.svelte')}
    <p class="mx-explorer__note">{ja.tree.loading}</p>
  {:then module}
    <module.default />
  {:catch}
    <p class="mx-explorer__note">{ja.tree.failed}</p>
  {/await}
{/if}

<style>
  .mx-explorer__note {
    margin: 0;
    padding: var(--mx-space-3);
    color: var(--mx-color-fg-subtle);
  }
</style>
