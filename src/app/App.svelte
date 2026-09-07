<!--
  アプリシェルのクローム部分。
  本文はここに無い（ADR-0005 / 02.architecture/08-state-management.md §1）。
  Svelte が描画するのはタイトルバー・ステータスバー・通知バー・Welcome だけで、`.mx-preview`（index.html 側にあり Svelte の管理外）の中身は `paint.ts` が直接 DOM へ挿入する。
  レイアウトは DOM 順ではなく `shell.css` の `grid-template-areas` が決める。
-->
<script lang="ts">
  import { documentStore } from '@/features/document';
  import { Outline } from '@/features/outline';
  import { RightPane } from '@/features/panes';
  import { SplitDivider, viewStore } from '@/features/view';
  import { tabsStore, TabStrip, Welcome } from '@/features/workspace';

  import NoticeBar from './NoticeBar.svelte';
  import StatusBar from './StatusBar.svelte';
  import TitleBar from './TitleBar.svelte';

  const meta = $derived(documentStore.meta);
</script>

<!--
  タブストリップ（M3 Phase 2）。**2 枚以上のときだけ渡す。**
  1 枚のときは `center` を渡さないので、タイトルバーは M2 と同じファイル名表示のままになる
  （03.ux-spec/01-screen-layout.md §1「タブも 1 枚のうちは出さない」）。
-->
{#snippet tabs()}
  <TabStrip />
{/snippet}

<TitleBar center={tabsStore.tabs.length > 1 ? tabs : undefined} />

{#if documentStore.notice}
  <NoticeBar notice={documentStore.notice} />
{/if}

{#if !meta}
  <Welcome />
{/if}

<!--
  Split の分割線（03.ux-spec/03-split-mode.md §1）。Split のときだけ存在する。

  `divider` の列は Split の `grid-template-areas` にしか無いため、他のモードで配置すると割り当て先が無くなる。
  ペインと同じく、不要なときは要素自体を作らない。
-->
{#if viewStore.mode === 'split'}
  <SplitDivider />
{/if}

<!--
  ライトペイン（03.ux-spec/06-panes.md）。開いていなければ要素自体が存在しない。
  `rightpane` の列は `auto` であるため、配置しなければ幅 0 になる（`shell.css`）。
  フラグで幅を 0 にするのではなく要素ごと削除するため、閉じている間はアウトラインの `IntersectionObserver` も動作しない（N-PERF-05）。

  開閉の初期値は bootstrap からシェルの描画前に設定されるため（`panes.ts`）、ここが 1 フレームだけ閉じた状態で描画されることはない。

  中身を決めるのはこの位置であり、`RightPane` は枠と幅だけを持つ（`RightPane.svelte`）。
  M3 でアウトラインを左へ移す場合も、変更するのはこの受け渡しだけになる。
-->
{#if viewStore.panes.right.open}
  <RightPane>
    <Outline />
  </RightPane>
{/if}

<StatusBar />
