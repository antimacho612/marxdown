<!--
  Explorer の中身（F-NAV-03 / 03.ux-spec/06-panes.md §1）。遅延チャンクの入口。

  `Explorer.svelte` の動的 import はここを指す。
  ツールバーとツリーを 1 つのチャンクにまとめてあり、ペインを開くと両方が同時に届く。

  ツールバーはスクロール領域の外に置く。
  中に入れると、木を下へ辿るたびに操作の入口が画面の外へ出てしまう。

  ツリーそのものに属さない仕事もここが持つ。
  開いている枝の監視（ADR-0021）、余白の右クリック、コンテキストメニュー、外部からのドロップの受け口（F-NAV-13）である。
  どれもペインが開いている間だけ要り、閉じれば（このコンポーネントが消えれば）解放する。
-->
<script lang="ts">
  import { onDestroy, onMount } from 'svelte';

  import { dirOf } from '@/lib/path';
  import { getPlatform } from '@/platform';

  import { registerExplorerCreate, registerTreeDrop } from '../show-explorer';
  import { refreshDirs, treeStore } from '../tree.svelte';
  import { importDropped, startCreate } from './actions';
  import ExplorerMenu from './ExplorerMenu.svelte';
  import ExplorerToolbar from './ExplorerToolbar.svelte';
  import FileTree from './FileTree.svelte';
  import { selection } from './selection.svelte';

  let scroller: HTMLElement | null = $state(null);

  /**
   * 開いている枝を監視する（ADR-0021）。
   *
   * 渡した集合がそのまま監視の対象になるため、枝を閉じれば次の呼び出しでその分が解放される。
   * 監視の解除はここではなく `onDestroy` で行う。effect の後始末で空を渡すと、枝を 1 つ開くたびに全解除と再登録が起きる。
   */
  $effect(() => {
    const root = treeStore.root;
    void getPlatform()
      .watchTree(root === null ? [] : [root, ...treeStore.expanded])
      .catch(() => {});
  });

  onMount(() => {
    const stopWatching = getPlatform().onDirChanged((dir) => void refreshDirs([dir]));
    registerExplorerCreate((kind) => void startCreate(kind === 'folder'));
    registerTreeDrop({ over: dragOver, drop, leave: () => (selection.dropTarget = null) });
    return stopWatching;
  });

  onDestroy(() => {
    registerExplorerCreate(null);
    registerTreeDrop(null);
    void getPlatform()
      .watchTree([])
      .catch(() => {});
  });

  /**
   * ビューポート座標の位置にある、落とす先のフォルダ。ツリーの外なら `null`。
   *
   * フォルダの上ならそのフォルダ、ファイルの上ならその親、余白なら基点である（`tree-drag.ts` と同じ規則）。
   */
  function folderAt(x: number, y: number): string | null {
    const root = treeStore.root;
    const element = document.elementFromPoint(x, y);
    if (root === null || !(element instanceof Element) || scroller === null || !scroller.contains(element)) return null;
    const item = element.closest<HTMLElement>('.mx-tree__item[data-mx-path]');
    const path = item?.dataset['mxPath'];
    if (path === undefined) return root;
    return item?.dataset['mxDir'] === 'true' ? path : dirOf(path);
  }

  function dragOver(x: number, y: number): boolean {
    selection.dropTarget = folderAt(x, y);
    return selection.dropTarget !== null;
  }

  function drop(paths: string[], x: number, y: number): boolean {
    const dest = folderAt(x, y);
    selection.dropTarget = null;
    if (dest === null) return false;
    void importDropped(paths, dest);
    return true;
  }

  /** 余白の右クリック。基点に対するメニューを開く（項目の上は `FileTree.svelte` が処理して伝播を止める）。 */
  function openBlankMenu(event: MouseEvent): void {
    event.preventDefault();
    selection.menu = { path: null, x: event.clientX, y: event.clientY };
  }

  /** 余白のクリックは選択を外す（VS Code と同じ）。 */
  function clearOnBlank(event: MouseEvent): void {
    if (event.target instanceof Element && event.target.closest('.mx-tree__item, input') !== null) return;
    selection.selected = [];
  }

  function closeMenu(refocus = true): void {
    selection.menu = null;
    if (refocus) selection.refocus = treeStore.focusPath;
  }
</script>

<ExplorerToolbar />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<!-- 余白のクリックと右クリックはマウスだけの補助である。キーボードでは `Escape` と `Shift+F10` が同じことをする（`tree-keys.ts`）。 -->
<div
  class="mx-explorer__tree"
  class:mx-explorer__tree--drop={selection.dropTarget !== null && selection.dropTarget === treeStore.root}
  bind:this={scroller}
  oncontextmenu={openBlankMenu}
  onclick={clearOnBlank}
>
  <FileTree />
</div>

{#if selection.menu !== null}
  <ExplorerMenu path={selection.menu.path} x={selection.menu.x} y={selection.menu.y} onclose={closeMenu} />
{/if}

<style>
  .mx-explorer__tree {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }

  /* 基点へ落とすときは、ツリーの面全体を強調する（フォルダ 1 行の強調と区別する）。 */
  .mx-explorer__tree--drop {
    outline: 1px dashed var(--mx-color-accent);
    outline-offset: -2px;
    background: color-mix(in srgb, var(--mx-color-accent) 6%, transparent);
  }
</style>
