<!--
  アプリシェルのクローム部分。

  **本文はここに無い**（ADR-0005 / 02.architecture/08-state-management.md §1）。
  Svelte が描くのはタイトルバー・ステータスバー・通知バー・Welcome だけで、
  `.mx-preview` の中身は `paint.ts` が直接 DOM に入れる。

  本文の受け皿（`#mx-preview`）は index.html 側にあり、Svelte の管理下に無い。
  だから「本文が読める」までにコンポーネントのマウントを待つ必要がない。

  行の並びは DOM 順ではなく `shell.css` の `grid-template-areas` が決める。
  M3 でタブが入るときは `TitleBar` の `center` にタブストリップを渡す
  （タブはタイトルバーと同じ 1 段に入る / 03.ux-spec/01-screen-layout.md §2）。
  ライトペインは `grid-area: rightpane` を持つコンポーネント 1 つで、
  grid の定義は作り直していない（Phase 3 がその形にしてある）。
  レフトペイン（Explorer / M3）も、同じように 1 つ足すだけで入る。
-->
<script lang="ts">
  import { documentStore } from '@/features/document/store.svelte';
  import RightPane from '@/features/panes/RightPane.svelte';
  import { viewStore } from '@/features/view/store.svelte';
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

<!--
  ライトペイン（03.ux-spec/06-panes.md）。**開いていなければ要素ごと存在しない。**
  `rightpane` の列は `auto` なので、置かなければ 0 幅に潰れる（`shell.css`）。
  フラグで幅を 0 にするのではなく本当に消すので、閉じている間は
  アウトラインの `IntersectionObserver` も動かない（N-PERF-05）。

  開閉の初期値は bootstrap から**シェルを描く前**に入っている（`panes.ts`）ので、
  ここが 1 フレームだけ閉じた状態で描かれることは無い。
-->
{#if viewStore.panes.right.open}
  <RightPane />
{/if}

<StatusBar />
