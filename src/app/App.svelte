<!--
  アプリシェルのクローム部分。
  本文はここに無い（ADR-0005）。
  Svelte が描画するのはタイトルバー・ステータスバー・通知バー・Welcome だけで、`.mx-preview`（index.html 側にあり Svelte の管理外）の中身は `paint.ts` が直接 DOM へ挿入する。
  レイアウトは DOM 順ではなく `shell.css` の `grid-template-areas` が決める。
-->
<script lang="ts">
  import { documentStore } from '@/features/document';
  import { Outline } from '@/features/outline';
  import { LeftPane, RightPane } from '@/features/panes';
  import { isSatellite, SplitDivider, viewStore } from '@/features/view';
  import { Explorer, tabsStore, TabStrip, Welcome } from '@/features/workspace';

  import NoticeBar from './NoticeBar.svelte';
  import StatusBar from './StatusBar.svelte';
  import TitleBar from './TitleBar.svelte';

  const meta = $derived(documentStore.meta);
</script>

<!--
  タブストリップ。1 枚でも渡す。
  枚数で表示が切り替わると、2 枚目を開いた瞬間にファイル名の位置と押せる場所が入れ替わる。
  何も開いていないときだけ `center` を渡さず、タイトルバーはアプリ名を表示する。
-->
{#snippet tabs()}
  <TabStrip />
{/snippet}

<TitleBar center={tabsStore.tabs.length > 0 ? tabs : undefined} />

{#if documentStore.notice}
  <NoticeBar notice={documentStore.notice} />
{/if}

<!--
  Welcome 画面はサテライトには出さない。
  タブが 0 枚になったサテライトは窓ごと閉じる（`features/workspace/tabs.svelte.ts`）ため、空の状態が画面に残ることがない。
-->
{#if !meta && !isSatellite()}
  <Welcome />
{/if}

<!--
  Split の分割線。Split のときだけ存在する。

  `divider` の列は Split の `grid-template-areas` にしか無いため、他のモードで配置すると割り当て先が無くなる。
  ペインと同じく、不要なときは要素自体を作らない。
-->
{#if viewStore.mode === 'split'}
  <SplitDivider />
{/if}

<!--
  レフトペイン（F-NAV-04）。ライトペインと同じ扱いで、開いていなければ要素ごと無い。
  中身はファイルツリー（F-NAV-03）。本体は遅延チャンクにあり、ペインを開くまで読み込まない（`Explorer.svelte`）。
-->
{#if viewStore.panes.left.open && !isSatellite()}
  <LeftPane>
    <Explorer />
  </LeftPane>
{/if}

<!--
  ライトペイン。開いていなければ要素自体が存在しない。
  `rightpane` の列は `auto` であるため、配置しなければ幅 0 になる（`shell.css`）。
  フラグで幅を 0 にするのではなく要素ごと削除するため、閉じている間はアウトラインの `IntersectionObserver` も動作しない（N-PERF-05）。

  開閉の初期値は bootstrap からシェルの描画前に設定されるため（`panes.ts`）、ここが 1 フレームだけ閉じた状態で描画されることはない。

  中身を決めるのはこの位置であり、`RightPane` は枠と幅だけを持つ（`RightPane.svelte`）。
  アウトラインの配置を変える場合も、変更するのはこの受け渡しだけになる。
-->
{#if viewStore.panes.right.open && !isSatellite()}
  <RightPane>
    <Outline />
  </RightPane>
{/if}

<StatusBar />
