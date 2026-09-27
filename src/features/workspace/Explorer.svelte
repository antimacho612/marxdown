<!--
  レフトペインの中身（F-NAV-03）。基点が決まっているときは動的 import の 1 行だけを持つ。

  ファイルツリー本体は遅延チャンクにあり、ペインを開くまで読み込まない（クリティカルパスの外 / 05.performance-budget）。`open-editor.ts` などと同じ形で、ここに置いても `workspace` の他の部分は `main` に残る。

  基点が決まるのは `marxdown <dir>` か「フォルダを開く」を通ったときだけである。
  開いているファイルの親ディレクトリを自動で基点にはしない。
-->
<script lang="ts">
  import { documentStore } from '@/features/document';
  import { t } from '@/i18n';
  import { runCommand } from '@/lib/commands';
  import { splitPath } from '@/lib/path';

  import { setTreeRootFromFile, treeStore } from './tree.svelte';

  const path = $derived(documentStore.meta?.path ?? null);

  /** 見出し行に出す基点の名前。パス全体はツールチップに表示する。 */
  const rootName = $derived(treeStore.root === null ? null : splitPath(treeStore.root).name || treeStore.root);

  /** ツリーの本体を読み込む。文言（`tExplorer`）の読み込みも待つ。 */
  async function loadBody() {
    const module = await import('./lazy/ExplorerBody.svelte');
    await module.ready;
    return module;
  }
</script>

<!--
  見出し行。
  ライトペイン（`features/outline/Outline.svelte`）が同じ形の行を持っており、こちらだけ無いと、左右のペインで情報の始まりが揃わない。
-->
<div class="mx-explorer__head">
  <span class="mx-explorer__title">{t.tree.title}</span>
  {#if rootName !== null}
    <span class="mx-explorer__root" title={treeStore.root}>{rootName}</span>
  {/if}
</div>

<!--
  中身を縦に並べるコンテナ。ペイン自身（`LeftPane.svelte`）は枠と幅だけを持つ。

  スクロールはここではなく中身の側が持つ。
  ツールバー（`lazy/ExplorerToolbar.svelte`）をスクロールさせないための分担であり、空状態とツリーがそれぞれ自分のスクロール領域を持つ。
-->
<div class="mx-explorer">
  {#if treeStore.root === null}
    <!--
      基点が無いときの空状態。
      文言だけでは次に何をすればよいか分からないため、そこから実行できる操作を並べる。
    -->
    <div class="mx-explorer__empty">
      <p class="mx-explorer__note">{t.tree.noRoot}</p>

      <button type="button" class="mx-explorer__action" onclick={() => runCommand('folder.open')}>
        {t.tree.openFolder}
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
          {t.tree.openCurrentFolder}
        </button>
      {/if}
    </div>
  {:else}
    {#await loadBody()}
      <p class="mx-explorer__note">{t.tree.loading}</p>
    {:then module}
      <module.default />
    {:catch}
      <p class="mx-explorer__note">{t.tree.failed}</p>
    {/await}
  {/if}
</div>

<style>
  /* 高さと罫線はアウトラインの見出し行と同じ値にする（`features/outline/Outline.svelte`）。 */
  .mx-explorer__head {
    display: flex;
    flex: none;
    align-items: center;
    gap: var(--mx-space-2);
    height: 28px;
    padding-inline: var(--mx-space-3);
    border-bottom: 1px solid var(--mx-color-border-subtle);
  }

  .mx-explorer__title {
    flex: none;
    color: var(--mx-color-fg-muted);
    font-size: var(--mx-font-size-ui-sm);
    font-weight: 600;
    letter-spacing: 0.04em;
  }

  .mx-explorer__root {
    min-width: 0;
    color: var(--mx-color-fg-subtle);
    font-size: var(--mx-font-size-ui-sm);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .mx-explorer {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
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
    min-height: 0;
    padding-bottom: var(--mx-space-3);
    overflow-y: auto;
  }

  .mx-explorer__empty .mx-explorer__note {
    padding-bottom: 0;
  }

  /* ペインが 180px まで狭くなるため、ボタンは幅いっぱいに置いて折り返しを許す */
  .mx-explorer__action {
    margin-inline: var(--mx-space-3);
    padding: var(--mx-space-2);
    border: 1px solid transparent;
    border-radius: var(--mx-radius);
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

  /*
   * 面の色で押し込みを表す。
   * `opacity` で薄くすると下地が透け、上に置いた文字（白）のコントラストが下がる。
   */
  .mx-explorer__action:hover {
    background: var(--mx-color-accent-hover);
  }

  .mx-explorer__action:active {
    background: var(--mx-color-accent-active);
  }

  .mx-explorer__action--secondary:hover {
    background: var(--mx-color-bg-hover);
  }

  .mx-explorer__action--secondary:active {
    background: var(--mx-color-bg-inset);
  }

  .mx-explorer__action:focus-visible {
    outline: 2px solid var(--mx-color-accent);
    outline-offset: 2px;
  }
</style>
