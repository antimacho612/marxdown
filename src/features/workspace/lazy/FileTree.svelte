<!--
  ファイルツリー（F-NAV-03 / 03.ux-spec/06-panes.md §1）。レフトペインの中身。

  **遅延チャンク側にある。** ペインを開くまで読み込まない（クリティカルパスの外 / 05.performance-budget）。
  入口は `Explorer.svelte` の動的 import で、`main` に残るのはその 1 行だけである。

  Markdown を通常の色で、それ以外を淡く表示する（Markdown First）。
  隠しファイルと `node_modules` は Rust 側で落ちてくるので、ここには来ない。

  **単一クリックで開く。** VS Code の「プレビュー的に開く（イタリックのタブ）」は採らない。
  タブの状態が 2 種類に増え、タブのモデル（M3 Phase 1）に例外を作ることになる割に、
  得られるのは「開きすぎたタブが自動で置き換わる」ことだけである。
-->
<script lang="ts">
  import { ja } from '@/i18n/ja';
  import { isMarkdownPath } from '@/lib/path';
  import type { DirEntry } from '@/platform';

  import { registerExplorerFocus } from '../show-explorer';
  import { openPathInNewTab } from '../tabs.svelte';
  import { toggleDir, treeStore } from '../tree.svelte';
  // 自分自身を再帰的に使う（`<svelte:self>` は非推奨）。
  import FileTree from './FileTree.svelte';

  interface Props {
    /** 表示するディレクトリ。省略すると基点から描く。 */
    dir?: string;
    /** 字下げの段数。 */
    depth?: number;
  }

  const { dir, depth = 0 }: Props = $props();

  const path = $derived(dir ?? treeStore.root ?? '');
  const entries = $derived(treeStore.entries[path] ?? []);
  const loading = $derived(treeStore.loading.includes(path));

  /** 木の根だけが持つ要素。フォーカスの受け口になる（`Ctrl+Shift+E`）。 */
  let list: HTMLElement | null = $state(null);

  /**
   * 根の 1 件目へフォーカスする手段を登録する（`show-explorer.ts`）。
   *
   * 入れ子の `FileTree` は登録しない。登録すると、枝を開くたびに受け口が入れ替わる。
   */
  $effect(() => {
    if (depth !== 0) return;
    registerExplorerFocus(() => list?.querySelector('button')?.focus());
    return () => registerExplorerFocus(null);
  });

  function open(entry: DirEntry): void {
    if (entry.dir) {
      void toggleDir(entry.path);
      return;
    }
    void openPathInNewTab(entry.path);
  }
</script>

{#if loading && entries.length === 0}
  <p class="mx-tree__note">{ja.tree.loading}</p>
{:else if entries.length === 0}
  <p class="mx-tree__note">{ja.tree.empty}</p>
{:else}
  <ul class="mx-tree" role={depth === 0 ? 'tree' : 'group'} bind:this={list}>
    {#each entries as entry (entry.path)}
      {@const expanded = treeStore.expanded.includes(entry.path)}
      <li role="treeitem" aria-expanded={entry.dir ? expanded : undefined} aria-selected="false">
        <button
          type="button"
          class="mx-tree__item"
          class:mx-tree__item--dim={!entry.dir && !isMarkdownPath(entry.name)}
          style:padding-inline-start="calc(var(--mx-space-2) + {depth * 12}px)"
          title={entry.path}
          onclick={() => open(entry)}
        >
          <span class="mx-tree__mark" aria-hidden="true">{entry.dir ? (expanded ? '▾' : '▸') : ''}</span>
          <span class="mx-tree__name">{entry.name}</span>
        </button>

        {#if entry.dir && expanded}
          <!-- 開いた枝だけを描く。閉じれば中身ごと消える（`tree.svelte.ts` が捨てる）。 -->
          <FileTree dir={entry.path} depth={depth + 1} />
        {/if}
      </li>
    {/each}
  </ul>
{/if}

<style>
  .mx-tree {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .mx-tree__note {
    margin: 0;
    padding: var(--mx-space-3);
    color: var(--mx-color-fg-subtle);
  }

  .mx-tree__item {
    display: flex;
    align-items: center;
    gap: var(--mx-space-1);
    width: 100%;
    padding-block: 3px;
    padding-inline-end: var(--mx-space-2);
    border: none;
    background: none;
    color: var(--mx-color-fg-muted);
    font: inherit;
    text-align: start;
    cursor: pointer;
  }

  .mx-tree__item:hover {
    background: var(--mx-color-bg-hover);
  }

  /* Markdown 以外は淡く（Markdown First）。押せることは変えない。 */
  .mx-tree__item--dim {
    color: var(--mx-color-fg-subtle);
  }

  .mx-tree__mark {
    flex: none;
    width: 1em;
    color: var(--mx-color-fg-subtle);
    font-size: 10px;
  }

  .mx-tree__name {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
</style>
