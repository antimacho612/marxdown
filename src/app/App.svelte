<!--
  アプリシェルのクローム部分。

  **本文はここに無い**（ADR-0005 / 02.architecture.md §8.1）。
  Svelte が描くのはタイトルバー・ステータスバー・通知バー・Welcome だけで、
  `.mx-preview` の中身は `paint.ts` が直接 DOM に入れる。

  本文の受け皿（`#mx-preview`）は index.html 側にあり、Svelte の管理下に無い。
  だから「本文が読める」までにコンポーネントのマウントを待つ必要がない。
-->
<script lang="ts">
  import { documentStore } from '@/features/document/store.svelte';
  import Welcome from '@/features/workspace/Welcome.svelte';
  import { ja } from '@/i18n/ja';
  import { splitPath } from '@/lib/path';

  import NoticeBar from './NoticeBar.svelte';
  import StatusBar from './StatusBar.svelte';

  const meta = $derived(documentStore.meta);
  const split = $derived(splitPath(meta?.path ?? ''));
</script>

<header class="mx-titlebar">
  <span class="mx-titlebar__name">{meta ? split.name : ja.app.name}</span>
  {#if meta}
    <span class="mx-titlebar__dir">{split.dir}</span>
  {/if}
</header>

{#if documentStore.notice}
  <NoticeBar notice={documentStore.notice} />
{/if}

{#if !meta}
  <Welcome />
{/if}

<StatusBar />

<style>
  /*
   * 行を DOM 順ではなく `grid-area` で明示しているのは、
   * 本文が DOM 上で先に来る（= クロームのマウントを待たずに描ける）ため。
   * grid 本体の定義は shell.css 側にある（本文と共有するレイアウトなので）。
   */
  .mx-titlebar {
    grid-area: 1 / 1;
    display: flex;
    align-items: center;
    gap: var(--mx-space-2);
    padding-inline: var(--mx-space-4);
    border-bottom: 1px solid var(--mx-color-border-subtle);
    background: var(--mx-color-bg-subtle);
    font-size: var(--mx-font-size-ui);
    min-width: 0;
  }

  .mx-titlebar__name {
    font-weight: 600;
    white-space: nowrap;
  }

  .mx-titlebar__dir {
    color: var(--mx-color-fg-subtle);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }
</style>
