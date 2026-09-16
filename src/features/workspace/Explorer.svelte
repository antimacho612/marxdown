<!--
  レフトペインの中身（F-NAV-03）。**基点が決まっているときは動的 import の 1 行だけを持つ。**

  ファイルツリー本体は遅延チャンクにあり、ペインを開くまで読み込まない
  （クリティカルパスの外 / 05.performance-budget）。`open-editor.ts` などと同じ形で、
  ここに置いても `workspace` の他の部分は `main` に残る。

  基点が決まるのは `marxdown <dir>` か「フォルダを開く」を通ったときだけである（#103）。
  開いているファイルの親ディレクトリを自動で基点にはしない。
-->
<script lang="ts">
  import { documentStore } from '@/features/document';
  import { ja } from '@/i18n/ja';
  import { runCommand } from '@/lib/commands';

  import { setTreeRootFromFile, treeStore } from './tree.svelte';

  const path = $derived(documentStore.meta?.path ?? null);
</script>

<!--
  スクロール領域（03.ux-spec/06-panes.md §1）。ペイン自身（`LeftPane.svelte`）は枠と幅だけを持つため、
  中身が縦に溢れたときの scroll はここが持つ（`Outline.svelte` の `mx-outline__list` と同じ分担）。
-->
<div class="mx-explorer">
  {#if treeStore.root === null}
    <!--
      基点が無いときの空状態（03.ux-spec/08-empty-states.md）。
      文言だけでは次に何をすればよいか分からないため、そこから実行できる操作を並べる。
    -->
    <div class="mx-explorer__empty">
      <p class="mx-explorer__note">{ja.tree.noRoot}</p>

      <button type="button" class="mx-explorer__action" onclick={() => runCommand('folder.open')}>
        {ja.tree.openFolder}
      </button>

      <!--
        表示中のファイルの親ディレクトリを基点にする。VS Code には無い導線である。
        ファイル指定で開くことが中心のアプリであり、ほとんどの場合に選びたいフォルダが既に決まっている。
        親ディレクトリは開いた時点で許可済みなので（`read_document`）、ダイアログで選び直してもらう必要も無い。
      -->
      {#if path !== null}
        <button
          type="button"
          class="mx-explorer__action mx-explorer__action--secondary"
          onclick={() => void setTreeRootFromFile(path)}
        >
          {ja.tree.openCurrentFolder}
        </button>
      {/if}
    </div>
  {:else}
    {#await import('./lazy/FileTree.svelte')}
      <p class="mx-explorer__note">{ja.tree.loading}</p>
    {:then module}
      <module.default />
    {:catch}
      <p class="mx-explorer__note">{ja.tree.failed}</p>
    {/await}
  {/if}
</div>

<style>
  .mx-explorer {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }

  .mx-explorer__note {
    margin: 0;
    padding: var(--mx-space-3);
    color: var(--mx-color-fg-subtle);
  }

  .mx-explorer__empty {
    display: flex;
    flex-direction: column;
    gap: var(--mx-space-2);
    padding-bottom: var(--mx-space-3);
  }

  .mx-explorer__empty .mx-explorer__note {
    padding-bottom: 0;
  }

  /* ペインが 180px まで狭くなるため、ボタンは幅いっぱいに置いて折り返しを許す（03.ux-spec/06-panes.md §3） */
  .mx-explorer__action {
    margin-inline: var(--mx-space-3);
    padding: var(--mx-space-2);
    border: 1px solid transparent;
    border-radius: var(--mx-radius-sm);
    background: var(--mx-color-accent);
    color: var(--mx-color-accent-fg);
    font: inherit;
    font-size: var(--mx-font-size-ui);
    cursor: pointer;
  }

  /*
   * 2 つ目は控えめにする。
   * 同じ強さで 2 つ並べると、どちらが通常の経路なのかを毎回読んで判断することになる。
   */
  .mx-explorer__action--secondary {
    border-color: var(--mx-color-border);
    background: var(--mx-color-bg-subtle);
    color: var(--mx-color-fg);
  }

  .mx-explorer__action:hover {
    opacity: 0.9;
  }

  .mx-explorer__action--secondary:hover {
    opacity: 1;
    background: var(--mx-color-bg-hover);
  }

  .mx-explorer__action:focus-visible {
    outline: 2px solid var(--mx-color-accent);
    outline-offset: 2px;
  }
</style>
