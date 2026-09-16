<!--
  ファイルツリー（F-NAV-03 / 03.ux-spec/06-panes.md §1）。レフトペインの中身。

  **遅延チャンク側にある。** ペインを開くまで読み込まない（クリティカルパスの外 / 05.performance-budget）。
  入口は `Explorer.svelte` の動的 import で、`main` に残るのはその 1 行だけである。

  Markdown を通常の色で、それ以外を淡く表示する（Markdown First）。
  隠しファイルと `node_modules` は Rust 側で落ちてくるので、ここには来ない。

  **単一クリックで開く。** VS Code の「プレビュー的に開く（イタリックのタブ）」は採らない。
  タブの状態が 2 種類に増え、タブのモデル（M3 Phase 1）に例外を作ることになる割に、
  得られるのは「開きすぎたタブが自動で置き換わる」ことだけである。

  キーボード操作と `role` の配り方は `features/outline/Outline.svelte` と揃えてある。
  以前はロールだけを宣言して矢印キーを持たず、`aria-expanded` も押せない `<li>` の側に付いていた。
-->
<script lang="ts">
  import { documentStore } from '@/features/document';
  import { ja } from '@/i18n/ja';
  import ChevronIcon from '@/lib/ChevronIcon.svelte';
  import Icon from '@/lib/Icon.svelte';
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

  /** 表示中のファイル。エクスプローラーを開いていても、どれを見ているのか分からない状態にしない。 */
  const current = $derived(documentStore.meta?.path ?? null);

  /** 木の根だけが持つ要素。フォーカスの受け口とキーボード操作の窓口になる（`Ctrl+Shift+E`）。 */
  let list: HTMLElement | null = $state(null);

  /**
   * 根の 1 件目へフォーカスする手段を登録する（`show-explorer.ts`）。
   *
   * 入れ子の `FileTree` は登録しない。登録すると、枝を開くたびに受け口が入れ替わる。
   */
  $effect(() => {
    if (depth !== 0) return;
    registerExplorerFocus(() => focusItem(stops()[0]));
    return () => registerExplorerFocus(null);
  });

  /** 順路に載っている項目の候補。開いている枝もすべて含む（DOM 順＝見えている順）。 */
  function stops(): HTMLElement[] {
    return [...(list?.querySelectorAll<HTMLElement>('.mx-tree__item') ?? [])];
  }

  /**
   * その項目へフォーカスを移し、Tab の順路も一緒に動かす。
   *
   * `focusin` を拾う形にはしない。
   * 木は再帰コンポーネントで、順路の持ち主（`treeStore.focusPath`）は根の外にある。
   * 焦点の移動と順路の更新を 1 か所で行うほうが、どの経路から来ても同じ結果になる。
   */
  function focusItem(item: HTMLElement | undefined): void {
    if (!item) return;
    treeStore.focusPath = item.dataset['mxPath'] ?? null;
    item.focus();
  }

  /**
   * 上下キーで項目を移動し、左右キーで枝を開閉する（WAI-ARIA の tree）。
   *
   * 根だけがこの処理を持つ。入れ子側にも付けると、1 回の打鍵が階層の数だけ処理される。
   */
  function onKeyDown(event: KeyboardEvent): void {
    const buttons = stops();
    const currentIndex = buttons.indexOf(document.activeElement as HTMLElement);
    if (currentIndex < 0) return;

    const focused = buttons[currentIndex];
    const entryPath = focused?.dataset['mxPath'] ?? '';
    const isDir = focused?.dataset['mxDir'] === 'true';
    const isExpanded = treeStore.expanded.includes(entryPath);

    // 閉じた枝の上で `→`、開いた枝の上で `←` は、移動ではなく開閉になる。
    if (event.key === 'ArrowRight' && isDir && !isExpanded) {
      void toggleDir(entryPath);
      event.preventDefault();
      return;
    }
    if (event.key === 'ArrowLeft' && isDir && isExpanded) {
      void toggleDir(entryPath);
      event.preventDefault();
      return;
    }

    const next =
      event.key === 'ArrowDown' || event.key === 'ArrowRight'
        ? currentIndex + 1
        : event.key === 'ArrowUp' || event.key === 'ArrowLeft'
          ? currentIndex - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? buttons.length - 1
              : -1;
    if (next < 0 || next >= buttons.length) return;

    focusItem(buttons[next]);
    event.preventDefault();
  }

  /**
   * その項目を Tab の順路に載せるか。
   *
   * 載せるのは木全体で 1 つだけ。まだ触っていなければ、根の 1 件目に置く。
   */
  function isStop(entry: DirEntry, index: number): boolean {
    if (treeStore.focusPath === null) return depth === 0 && index === 0;
    return treeStore.focusPath === entry.path;
  }

  function open(entry: DirEntry): void {
    // 押した項目を順路に載せる。次に Tab で戻ったとき、離れた場所に着地しない。
    treeStore.focusPath = entry.path;
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
  <!--
    `role` と状態は `<button>` 側に置く。
    `<li>` に付けると、フォーカスが当たるのは中のボタンなので、開閉の状態が読み上げられない。
  -->
  <ul
    class="mx-tree"
    role={depth === 0 ? 'tree' : 'group'}
    bind:this={list}
    onkeydown={depth === 0 ? onKeyDown : undefined}
  >
    {#each entries as entry, index (entry.path)}
      {@const expanded = treeStore.expanded.includes(entry.path)}
      {@const active = !entry.dir && entry.path === current}
      <li role="none">
        <button
          type="button"
          role="treeitem"
          class="mx-tree__item"
          class:mx-tree__item--dim={!entry.dir && !isMarkdownPath(entry.name)}
          class:mx-tree__item--active={active}
          tabindex={isStop(entry, index) ? 0 : -1}
          aria-level={depth + 1}
          aria-expanded={entry.dir ? expanded : undefined}
          aria-selected={active}
          aria-current={active ? 'true' : undefined}
          data-mx-path={entry.path}
          data-mx-dir={entry.dir}
          style:padding-inline-start="calc(var(--mx-space-2) + {depth * 12}px)"
          title={entry.path}
          onclick={() => open(entry)}
        >
          <!-- ファイルには三角が無い。名前の左辺を揃えるため、場所だけ空ける。 -->
          {#if entry.dir}
            <ChevronIcon {expanded} size={12} />
          {:else}
            <span class="mx-tree__mark" aria-hidden="true"></span>
          {/if}
          <!--
            種別の図記号。
            名前だけが縦に並ぶと、行の頭がすべて文字になって走査できない。
            Markdown とそれ以外を分けるのは、淡さ（`--dim`）と同じ「Markdown First」の表れである。
          -->
          <Icon name={entry.dir ? 'folder' : isMarkdownPath(entry.name) ? 'document-text' : 'document'} size={14} />
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

  .mx-tree__item:active {
    background: var(--mx-color-bg-inset);
  }

  .mx-tree__item:focus-visible {
    outline: 2px solid var(--mx-color-accent);
    outline-offset: -2px;
  }

  /* Markdown 以外は淡く（Markdown First）。押せることは変えない。 */
  .mx-tree__item--dim {
    color: var(--mx-color-fg-subtle);
  }

  /* ホバー中の面（`bg-hover`）では subtle が 4.5:1 に届かない。1 段上げる。 */
  .mx-tree__item--dim:hover {
    color: var(--mx-color-fg-muted);
  }

  /* 表示中のファイル。印はアウトラインの現在位置と同じものを使う。 */
  .mx-tree__item--active,
  .mx-tree__item--active:hover {
    box-shadow: var(--mx-current-marker);
    background: var(--mx-color-bg-inset);
    color: var(--mx-color-fg);
  }

  .mx-tree__mark {
    flex: none;
    width: 12px;
  }

  .mx-tree__name {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
</style>
