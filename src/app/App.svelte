<!--
  アプリシェルのクローム部分。

  **本文はここに無い**（ADR-0005 / 02.architecture.md §8.1）。
  Svelte が描くのはタイトルバー・ステータスバー・通知バー・Welcome だけで、
  `.mx-preview` の中身は `paint.ts` が直接 DOM に入れる。

  本文の受け皿（`#mx-preview`）は index.html 側にあり、Svelte の管理下に無い。
  だから「本文が読める」までにコンポーネントのマウントを待つ必要がない。

  行の並びは DOM 順ではなく `shell.css` の `grid-template-areas` が決める。
  M3 でタブが入るときは `TitleBar` の `center` にタブストリップを渡す
  （タブはタイトルバーと同じ 1 段に入る / 03.ux-spec.md §2.2）。
  Phase 6 のライトペインは `grid-area: rightpane` を持つコンポーネントを
  ここに 1 つ足すだけでよく、grid の定義は作り直さない。
-->
<script lang="ts">
  import { documentStore } from '@/features/document/store.svelte';
  import Welcome from '@/features/workspace/Welcome.svelte';

  import NoticeBar from './NoticeBar.svelte';
  import StatusBar from './StatusBar.svelte';
  import TitleBar from './TitleBar.svelte';

  const meta = $derived(documentStore.meta);
</script>

<TitleBar />

{#if documentStore.notice}
  <NoticeBar notice={documentStore.notice} />
{/if}

{#if !meta}
  <Welcome />
{/if}

<StatusBar />
