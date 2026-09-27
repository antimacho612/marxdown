<!--
  ファイルツリー（F-NAV-03 / 03.ux-spec/06-panes.md §1）。レフトペインの中身。

  遅延チャンク側にある。
  ペインを開くまで読み込まない（クリティカルパスの外 / 05.performance-budget）。
  入口は `Explorer.svelte` の動的 import で、`main` に残るのはその 1 行だけである。

  Markdown を通常の色で、それ以外を淡く表示する（Markdown First）。
  隠しファイルと `node_modules` は Rust 側で除外されるため、ここには来ない。

  ツールバーの絞り込み（`filter.svelte.ts`）はここで適用する。
  ディレクトリは対象外なので、絞り込んでいても枝を辿れる。

  単一クリックで開く。
  `explorer.temporaryTab` が ON なら仮タブで開き、ダブルクリックで通常のタブにする（ADR-0025）。

  フォーカス（`treeStore.focusPath`）と選択（`selection.svelte.ts`）を分けて持つ（§1.4）。
  表示中の文書は `aria-current` で表し、選択とは兼ねない。

  キーボード操作と `role` の割り当て方は `features/outline/Outline.svelte` と揃えてある。
  ファイル操作のキーは `tree-keys.ts` にある。
-->
<script lang="ts">
  import { tick } from 'svelte';

  import { documentStore } from '@/features/document';
  import { settingsStore } from '@/features/settings';
  import { ja } from '@/i18n/ja';
  import ChevronIcon from '@/lib/ChevronIcon.svelte';
  import Icon from '@/lib/Icon.svelte';
  import { isMarkdownPath } from '@/lib/path';
  import type { DirEntry } from '@/platform';

  import { openPathInSatellite } from '../new-window';
  import { registerExplorerFocus } from '../show-explorer';
  import { openPathInNewTab } from '../tabs.svelte';
  import { toggleDir, treeStore } from '../tree.svelte';
  import { commitCreate, commitRename, siblingNames } from './actions';
  // 自分自身を再帰的に使う（`<svelte:self>` は非推奨）。
  import FileTree from './FileTree.svelte';
  import { visibleEntries } from './filter.svelte';
  import InlineInput from './InlineInput.svelte';
  import { isCut, selection, selectOnly, selectRange, toggleSelected } from './selection.svelte';
  import { keepTabOf, openPathInTemporaryTab } from './temporary-tab.svelte';
  import { consumeDragClick, pressItem } from './tree-drag';
  import { handleTreeKey } from './tree-keys';

  interface Props {
    /** 表示するディレクトリ。省略すると基点から描く。 */
    dir?: string;
    /** 字下げの段数。 */
    depth?: number;
  }

  const { dir, depth = 0 }: Props = $props();

  const path = $derived(dir ?? treeStore.root ?? '');
  const loaded = $derived(treeStore.entries[path] ?? []);
  const entries = $derived(visibleEntries(loaded));
  const loading = $derived(treeStore.loading.includes(path));

  /** この枝の先頭に、新しい項目の名前を受け取る入力欄を出すか。 */
  const creating = $derived(
    selection.editing?.kind === 'create' && selection.editing.parent === path ? selection.editing : null,
  );

  /** 表示中のファイル。エクスプローラーを開いていても、どれを見ているのか分からない状態にしない。 */
  const current = $derived(documentStore.meta?.path ?? null);

  /** 木の根だけが持つ要素。フォーカスの受け取り先とキーボード操作の処理先になる（`Ctrl+Shift+E`）。 */
  let list: HTMLElement | null = $state(null);

  /**
   * 根の 1 件目へフォーカスする手段を登録する（`show-explorer.ts`）。
   *
   * 入れ子の `FileTree` は登録しない。登録すると、枝を開くたびに受け取り先が入れ替わる。
   */
  $effect(() => {
    if (depth !== 0) return;
    registerExplorerFocus(() => focusItem(stops()[0]));
    return () => registerExplorerFocus(null);
  });

  /**
   * 作成・リネーム・メニューを閉じた後に、指定された項目へフォーカスを移す（`selection.refocus`）。
   *
   * 新しい項目の要素は読み直しが終わるまで存在しないため、一覧が変わるたびに探し直す。
   */
  $effect(() => {
    if (depth !== 0) return;
    const target = selection.refocus;
    void treeStore.entries;
    if (target === null) return;
    void (async () => {
      await tick();
      const item = stops().find((element) => element.dataset['mxPath'] === target);
      if (item === undefined) return;
      selection.refocus = null;
      focusItem(item);
      item.scrollIntoView({ block: 'nearest' });
    })();
  });

  /** 順路に置ける項目の候補。開いている枝もすべて含む（DOM 順＝見えている順）。 */
  function stops(): HTMLElement[] {
    return [...(list?.querySelectorAll<HTMLElement>('.mx-tree__item') ?? [])];
  }

  /**
   * その項目へフォーカスを移し、Tab の順路も一緒に動かす。
   *
   * `focusin` で処理する形にはしない。
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
   * `Shift` を押しながらの上下は選択範囲を広げる。
   *
   * 根だけがこの処理を持つ。入れ子側にも付けると、1 回の打鍵が階層の数だけ処理される。
   */
  function onKeyDown(event: KeyboardEvent): void {
    // 行内の入力欄での打鍵は、文字の編集である（`InlineInput.svelte` も伝播を止めている）。
    if (event.target instanceof HTMLInputElement) return;

    const buttons = stops();
    const currentIndex = buttons.indexOf(document.activeElement as HTMLElement);
    if (currentIndex < 0) return;

    const focused = buttons[currentIndex];
    if (focused === undefined) return;
    const entryPath = focused.dataset['mxPath'] ?? '';
    const isDir = focused.dataset['mxDir'] === 'true';
    const isExpanded = treeStore.expanded.includes(entryPath);

    const moveTo = (target: string): void => focusItem(buttons.find((item) => item.dataset['mxPath'] === target));
    if (handleTreeKey(event, focused, entryPath, moveTo)) {
      event.preventDefault();
      return;
    }

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

    const target = buttons[next];
    focusItem(target);
    const targetPath = target?.dataset['mxPath'];
    if (targetPath !== undefined) {
      if (event.shiftKey)
        selectRange(
          targetPath,
          buttons.map((item) => item.dataset['mxPath'] ?? ''),
        );
      else selectOnly(targetPath);
    }
    event.preventDefault();
  }

  /**
   * その項目を Tab の順路に置くか。
   *
   * 置くのは木全体で 1 つだけである。まだ操作していなければ、根の 1 件目に置く。
   */
  function isStop(entry: DirEntry, index: number): boolean {
    if (treeStore.focusPath === null) return depth === 0 && index === 0;
    return treeStore.focusPath === entry.path;
  }

  /**
   * 開く。`Shift+Click` はサテライトウィンドウで開く（F-OPEN-06）。
   *
   * ブラウザの慣習に合わせてある（`Shift+Click` が新しいウィンドウ）。
   * ただし 2 件以上を選んでいる間の `Shift+Click` と、フォルダへの `Shift+Click` は範囲選択になる（03.ux-spec/04-keybindings.md §3）。
   * `Ctrl+Click` は選択に加える / 外す操作で、開かない。
   *
   * ディレクトリは開閉する。ファイルツリーの基点はウィンドウごとに 1 つであり、枝の開閉は別ウィンドウと関係がない。
   */
  function open(entry: DirEntry, event: MouseEvent): void {
    // ドラッグを終えた直後のクリックは、開く操作ではない（`tree-drag.ts`）。
    if (consumeDragClick()) return;

    // 押した項目を順路に置く。次に Tab で戻ったとき、離れた場所へ移動しない。
    treeStore.focusPath = entry.path;

    if (event.ctrlKey || event.metaKey) {
      toggleSelected(entry.path);
      return;
    }
    if (event.shiftKey && (entry.dir || selection.selected.length >= 2)) {
      selectRange(
        entry.path,
        stopsFromRoot().map((item) => item.dataset['mxPath'] ?? ''),
      );
      return;
    }

    selectOnly(entry.path);
    if (entry.dir) {
      void toggleDir(entry.path);
      return;
    }
    if (event.shiftKey) {
      void openPathInSatellite(entry.path);
      return;
    }
    if (settingsStore.values['explorer.temporaryTab']) void openPathInTemporaryTab(entry.path);
    else void openPathInNewTab(entry.path);
  }

  /** ファイルのダブルクリックは、単一クリックで開いた仮タブを通常のタブにする（ADR-0025）。 */
  function keep(entry: DirEntry, event: MouseEvent): void {
    if (entry.dir || event.ctrlKey || event.metaKey || event.shiftKey) return;
    void keepTabOf(entry.path);
  }

  /** 入れ子の枝からでも、木全体の見えている順を得る。範囲選択は枝を跨ぐ。 */
  function stopsFromRoot(): HTMLElement[] {
    const tree = list?.closest('[role="tree"]') ?? list;
    return [...(tree?.querySelectorAll<HTMLElement>('.mx-tree__item') ?? [])];
  }

  function openMenu(entry: DirEntry, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    treeStore.focusPath = entry.path;
    selection.menu = { path: entry.path, x: event.clientX, y: event.clientY };
  }

  function scrollerOf(element: EventTarget | null): HTMLElement | null {
    return element instanceof Element ? element.closest<HTMLElement>('.mx-explorer__tree') : null;
  }

  function cancelEditing(): void {
    const editing = selection.editing;
    selection.editing = null;
    // 取り消した後は、編集していた項目（作成なら親）へフォーカスを戻す。入力欄と一緒にフォーカスが消えると、次の操作の起点が無くなる。
    if (editing === null) return;
    selection.refocus = editing.kind === 'rename' ? editing.path : treeStore.focusPath;
  }
</script>

{#snippet createInput()}
  {#if creating !== null}
    <li role="none">
      <InlineInput
        initial=""
        dir={creating.dir}
        siblings={siblingNames(path)}
        self={null}
        {depth}
        oncommit={(name) => void commitCreate(path, creating.dir, name)}
        oncancel={cancelEditing}
      />
    </li>
  {/if}
{/snippet}

{#if loading && entries.length === 0 && creating === null}
  <p class="mx-tree__note">{ja.tree.loading}</p>
{:else if entries.length === 0 && creating === null}
  <!-- 空のフォルダと、絞り込んだ結果 0 件になった状態を書き分ける。前者では条件を緩めても何も増えない。 -->
  <p class="mx-tree__note">{loaded.length === 0 ? ja.tree.empty : ja.tree.noMatch}</p>
{:else}
  <!--
    `role` と状態は `<button>` 側に置く。
    `<li>` に付けると、フォーカスが当たるのは中のボタンなので、開閉の状態が読み上げられない。
  -->
  <ul
    class="mx-tree"
    role={depth === 0 ? 'tree' : 'group'}
    aria-multiselectable={depth === 0 ? true : undefined}
    bind:this={list}
    onkeydown={depth === 0 ? onKeyDown : undefined}
  >
    {@render createInput()}
    {#each entries as entry, index (entry.path)}
      {@const expanded = treeStore.expanded.includes(entry.path)}
      {@const active = !entry.dir && entry.path === current}
      {@const renaming = selection.editing?.kind === 'rename' && selection.editing.path === entry.path}
      <li role="none">
        {#if renaming}
          <InlineInput
            initial={entry.name}
            dir={entry.dir}
            siblings={siblingNames(path)}
            self={entry.name}
            {depth}
            oncommit={(name) => void commitRename(entry.path, name)}
            oncancel={cancelEditing}
          />
        {:else}
          <button
            type="button"
            role="treeitem"
            class="mx-tree__item"
            class:mx-tree__item--dim={!entry.dir && !isMarkdownPath(entry.name)}
            class:mx-tree__item--active={active}
            class:mx-tree__item--selected={selection.selected.includes(entry.path)}
            class:mx-tree__item--cut={isCut(entry.path)}
            class:mx-tree__item--drop={selection.dropTarget === entry.path}
            tabindex={isStop(entry, index) ? 0 : -1}
            aria-level={depth + 1}
            aria-expanded={entry.dir ? expanded : undefined}
            aria-selected={selection.selected.includes(entry.path)}
            aria-current={active ? 'true' : undefined}
            data-mx-path={entry.path}
            data-mx-dir={entry.dir}
            style:padding-inline-start="calc(var(--mx-space-2) + {depth * 12}px)"
            title={entry.path}
            onclick={(event) => open(entry, event)}
            ondblclick={(event) => keep(entry, event)}
            oncontextmenu={(event) => openMenu(entry, event)}
            onpointerdown={(event) => pressItem(event, entry.path, scrollerOf(event.currentTarget))}
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
        {/if}

        {#if entry.dir && expanded}
          <!-- 開いた枝だけを描く。閉じれば中身ごと消える（`tree.svelte.ts` が破棄する）。 -->
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

  /*
   * 選択。表示中の印（左端の線）とは別の手段で表す。
   * 面の色だけにすると、ホバーと押し込みの面に紛れる。
   */
  .mx-tree__item--selected,
  .mx-tree__item--selected:hover {
    background: color-mix(in srgb, var(--mx-color-accent) 16%, transparent);
    color: var(--mx-color-fg);
  }

  /* 切り取り中。貼り付けるか `Escape` で取り消すまで淡く保つ。 */
  .mx-tree__item--cut {
    opacity: 0.55;
  }

  /* ドラッグで落とす先。 */
  .mx-tree__item--drop,
  .mx-tree__item--drop:hover {
    outline: 1px dashed var(--mx-color-accent);
    outline-offset: -1px;
    background: color-mix(in srgb, var(--mx-color-accent) 10%, transparent);
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
