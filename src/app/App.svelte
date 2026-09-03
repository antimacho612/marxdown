<!--
  アプリシェルのクローム部分。
  本文はここに無い（ADR-0005 / 02.architecture/08-state-management.md §1）。
  Svelte が描くのはタイトルバー・ステータスバー・通知バー・Welcome だけで、`.mx-preview`（index.html 側にあり Svelte の管理外）の中身は `paint.ts` が直接 DOM に入れる。
  レイアウトは DOM 順ではなく `shell.css` の `grid-template-areas` が決める。
-->
<script lang="ts">
  import { documentStore } from '@/features/document/store.svelte';
  import Outline from '@/features/outline/Outline.svelte';
  import RightPane from '@/features/panes/RightPane.svelte';
  import SplitDivider from '@/features/view/SplitDivider.svelte';
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
  Split の分割線（03.ux-spec/03-split-mode.md §1）。**Split のときだけ存在する。**

  `divider` の列は Split の `grid-template-areas` にしか無いので、
  他のモードで置くと行き場を失う。ペインと同じく「無いときは要素ごと無い」。
-->
{#if viewStore.mode === 'split'}
  <SplitDivider />
{/if}

<!--
  ライトペイン（03.ux-spec/06-panes.md）。**開いていなければ要素ごと存在しない。**
  `rightpane` の列は `auto` なので、置かなければ 0 幅に潰れる（`shell.css`）。
  フラグで幅を 0 にするのではなく本当に消すので、閉じている間は
  アウトラインの `IntersectionObserver` も動かない（N-PERF-05）。

  開閉の初期値は bootstrap から**シェルを描く前**に入っている（`panes.ts`）ので、
  ここが 1 フレームだけ閉じた状態で描かれることは無い。

  **中身を決めるのはここ。** `RightPane` は枠と幅しか持たない（`RightPane.svelte`）。
  M3 でアウトラインを左へ移すときも、直すのはこの受け渡しだけになる。
-->
{#if viewStore.panes.right.open}
  <RightPane>
    <Outline />
  </RightPane>
{/if}

<StatusBar />
