<!--
  @component
  ファイルツリーの右クリックメニュー（F-NAV-11 / 03.ux-spec/06-panes.md §1.4）。

  対象は「右クリックした項目が選択に含まれていれば選択全体、含まれていなければその 1 件」である（`targetsFor`）。
  余白で開いたときは基点に対するメニューになる。

  複数選択の間、1 件にしか意味を持たない項目は `aria-disabled` にする。
  隠すと、同じ位置にあった項目がずれて押し間違える。

  見た目とキー操作はタブの右クリックメニュー（`TabMenu.svelte`）に揃える。
-->
<script lang="ts">
  import { onMount } from 'svelte';

  import { jaExplorer } from '@/i18n/ja-explorer';
  import { splitPath } from '@/lib/path';

  import { treeStore } from '../tree.svelte';
  import {
    copyMarkdownLink,
    copyPaths,
    findEntry,
    openEntry,
    paste,
    revealEntry,
    setClipboard,
    startCreate,
    startRename,
    trashTargets,
  } from './actions';
  import { selection, targetsFor } from './selection.svelte';

  interface Props {
    /** 右クリックした項目。余白なら `null`。 */
    path: string | null;
    x: number;
    y: number;
    /** 閉じる。`refocus` が false のときはツリーへフォーカスを戻さない（実行した操作に関心が移っているため）。 */
    onclose: (refocus?: boolean) => void;
  }

  const { path, x, y, onclose }: Props = $props();

  const EDGE_MARGIN = 8;

  interface Item {
    id: string;
    label: string;
    /** 右端に添えるキー。ツリー内のキー（03.ux-spec/04-keybindings.md §3）と同じものを出す。 */
    keys?: string;
    disabled?: boolean;
    run: () => void;
  }

  let panel: HTMLElement;
  let placed = $state<{ left: number; top: number } | null>(null);

  // 開いた時点の対象で固定する。開いている間に選択が変わっても、押した項目の意味を変えない。
  // svelte-ignore state_referenced_locally
  const base = path ?? treeStore.root;
  // svelte-ignore state_referenced_locally
  const targets = path === null ? [] : targetsFor(path);
  // svelte-ignore state_referenced_locally
  const entry = path === null ? null : findEntry(path);
  const single = targets.length <= 1;
  const file = entry !== null && !entry.dir;

  const groups: Item[][] = [
    file
      ? [
          { id: 'open', label: jaExplorer.menu.open, disabled: !single, run: () => openEntry(entry.path) },
          {
            id: 'satellite',
            label: jaExplorer.menu.openSatellite,
            disabled: !single,
            run: () => openEntry(entry.path, true),
          },
        ]
      : [],
    [
      { id: 'new-file', label: jaExplorer.menu.newFile, disabled: !single, run: () => void startCreate(false, base) },
      {
        id: 'new-folder',
        label: jaExplorer.menu.newFolder,
        disabled: !single,
        run: () => void startCreate(true, base),
      },
    ],
    [
      ...(targets.length > 0
        ? [
            { id: 'cut', label: jaExplorer.menu.cut, keys: 'Ctrl+X', run: () => setClipboard(targets, 'cut') },
            { id: 'copy', label: jaExplorer.menu.copy, keys: 'Ctrl+C', run: () => setClipboard(targets, 'copy') },
          ]
        : []),
      {
        id: 'paste',
        label: jaExplorer.menu.paste,
        keys: 'Ctrl+V',
        disabled: selection.clipboard === null,
        run: () => void paste(base),
      },
    ],
    [
      {
        id: 'copy-path',
        label: jaExplorer.menu.copyPath,
        keys: 'Shift+Alt+C',
        run: () => void copyPaths(targets.length > 0 ? targets : [base ?? ''], false),
      },
      {
        id: 'copy-relative',
        label: jaExplorer.menu.copyRelativePath,
        keys: 'Ctrl+Shift+Alt+C',
        run: () => void copyPaths(targets.length > 0 ? targets : [base ?? ''], true),
      },
      ...(file
        ? [
            {
              id: 'copy-link',
              label: jaExplorer.menu.copyLink,
              disabled: !single,
              run: () => void copyMarkdownLink(entry.path),
            },
          ]
        : []),
    ],
    [{ id: 'reveal', label: jaExplorer.menu.reveal, keys: 'Shift+Alt+R', run: () => void revealEntry(base ?? '') }],
    targets.length > 0
      ? [
          {
            id: 'rename',
            label: jaExplorer.menu.rename,
            keys: 'F2',
            disabled: !single,
            run: () => startRename(targets[0] ?? ''),
          },
          { id: 'delete', label: jaExplorer.menu.delete, keys: 'Delete', run: () => void trashTargets(targets) },
        ]
      : [],
  ].filter((group) => group.length > 0);

  const label = jaExplorer.menu.label(splitPath(base ?? '').name || (base ?? ''));

  function buttons(): HTMLButtonElement[] {
    return [...panel.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
  }

  function move(step: number): void {
    const list = buttons();
    if (list.length === 0) return;
    const index = list.indexOf(document.activeElement as HTMLButtonElement);
    list[(index + step + list.length) % list.length]?.focus();
  }

  onMount(() => {
    const box = panel.getBoundingClientRect();
    placed = {
      left: Math.max(EDGE_MARGIN, Math.min(x, globalThis.innerWidth - box.width - EDGE_MARGIN)),
      top: Math.max(EDGE_MARGIN, Math.min(y, globalThis.innerHeight - box.height - EDGE_MARGIN)),
    };
    buttons()[0]?.focus();
  });

  function activate(item: Item): void {
    if (item.disabled === true) return;
    // 行内の入力欄を出す操作は、閉じた後のフォーカスを入力欄に譲る。
    const keepFocus = item.id === 'new-file' || item.id === 'new-folder' || item.id === 'rename';
    onclose(!keepFocus && item.id !== 'delete');
    item.run();
  }

  function onKeydown(event: KeyboardEvent): void {
    // ツリーのキー操作へ渡さない。
    event.stopPropagation();
    switch (event.key) {
      case 'Escape': {
        onclose();
        break;
      }
      case 'ArrowDown': {
        move(1);
        break;
      }
      case 'ArrowUp': {
        move(-1);
        break;
      }
      case 'Home': {
        buttons()[0]?.focus();
        break;
      }
      case 'End': {
        buttons().at(-1)?.focus();
        break;
      }
      case 'Tab': {
        onclose();
        break;
      }
      default: {
        return;
      }
    }
    event.preventDefault();
  }

  function onOutside(event: PointerEvent): void {
    if (event.target instanceof Node && panel.contains(event.target)) return;
    onclose(false);
  }
</script>

<svelte:window onpointerdown={onOutside} onresize={() => onclose(false)} onblur={() => onclose(false)} />

<div
  class="mx-emenu"
  role="menu"
  aria-label={label}
  tabindex="-1"
  style:left="{placed?.left ?? x}px"
  style:top="{placed?.top ?? y}px"
  style:visibility={placed ? 'visible' : 'hidden'}
  bind:this={panel}
  onkeydown={onKeydown}
  oncontextmenu={(event) => event.preventDefault()}
>
  {#each groups as group, index (group[0]?.id)}
    {#if index > 0}
      <div class="mx-emenu__separator" role="separator"></div>
    {/if}
    {#each group as item (item.id)}
      <button
        type="button"
        class="mx-emenu__item"
        role="menuitem"
        aria-disabled={item.disabled === true}
        onclick={() => activate(item)}
      >
        <span>{item.label}</span>
        {#if item.keys}
          <span class="mx-emenu__keys" aria-hidden="true">{item.keys}</span>
        {/if}
      </button>
    {/each}
  {/each}
</div>

<style>
  /* 見た目はタブの右クリックメニュー（`TabMenu.svelte`）とハンバーガーメニューに揃える。 */
  .mx-emenu {
    position: fixed;
    z-index: 40;
    min-width: 14rem;
    padding: var(--mx-space-1) 0;
    border: 1px solid var(--mx-color-border);
    border-radius: var(--mx-radius);
    background: var(--mx-color-bg-subtle);
    box-shadow: var(--mx-shadow-1);
    font-size: var(--mx-font-size-ui);

    &:focus {
      outline: none;
    }
  }

  .mx-emenu__item {
    display: flex;
    justify-content: space-between;
    gap: var(--mx-space-4);
    width: 100%;
    padding: var(--mx-space-1) var(--mx-space-3);
    border: none;
    background: none;
    color: var(--mx-color-fg);
    font: inherit;
    text-align: start;
    white-space: nowrap;
    cursor: default;

    &:hover {
      background: var(--mx-color-bg-hover);
    }

    &:focus-visible {
      outline: 2px solid var(--mx-color-accent);
      outline-offset: -2px;
    }

    &[aria-disabled='true'] {
      color: var(--mx-color-fg-subtle);

      &:hover {
        background: none;
      }
    }
  }

  .mx-emenu__keys {
    color: var(--mx-color-fg-subtle);
    font-size: var(--mx-font-size-ui-sm);
  }

  .mx-emenu__separator {
    height: 1px;
    margin: var(--mx-space-1) 0;
    background: var(--mx-color-border-subtle);
  }
</style>
