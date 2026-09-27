<!--
  Explorer のツールバー（F-NAV-03）。

  遅延チャンク側にある。ペインを開くまで読み込まない（`ExplorerBody.svelte`）。

  並びは「作る」「絞る」「表示を整える」の 3 群で、群の間に区切りを置く。
  ボタンの見た目は `mx-etoolbar__button` に集約してあり、増やすときは要素を追加するだけでよい。

  文字ラベルは置かない。ペインは 180px まで狭くなるため、操作が増えた分だけ折り返しで縦に伸びる。
  代わりに、現在の状態をツールチップへ添える（`app/StatusBar.svelte` の `⇄` と同じ理由）。
-->
<script lang="ts">
  import { t } from '@/i18n';
  import { tExplorer } from '@/i18n/explorer';
  import Icon from '@/lib/Icon.svelte';

  import { collapseAll, reloadTree, treeStore } from '../tree.svelte';
  import { startCreate } from './actions';
  import { filterStore } from './filter.svelte';

  /** 拡張子フィルターが有効な間、Markdown フィルターは表示を変えない（`filter.svelte.ts`）。 */
  const overridden = $derived(filterStore.extensions.length > 0);

  let row: HTMLElement | null = $state(null);
  let input: HTMLInputElement | null = $state(null);
  let extensionsButton: HTMLButtonElement | null = $state(null);

  /** Tab の順路に置くボタンの位置（roving tabindex）。 */
  let stop = $state(0);

  /** 開いた直後に入力欄へフォーカスする。開いた後にもう一度クリックする操作を必要としない。 */
  $effect(() => {
    if (filterStore.extensionsOpen) input?.focus();
  });

  /**
   * 順路に置くボタンを 1 つに絞る（WAI-ARIA の toolbar）。
   *
   * 木も同じ規則で動いており（`FileTree.svelte`）、ペインの中で移動の仕方を変えない。
   * 属性ではなく DOM 側で割り当てるのは、ボタンを追加するたびに添字を書き足さずに済ませるためである。
   */
  $effect(() => {
    for (const [index, item] of buttons().entries()) item.tabIndex = index === stop ? 0 : -1;
  });

  function buttons(): HTMLButtonElement[] {
    return [...(row?.querySelectorAll<HTMLButtonElement>('.mx-etoolbar__button') ?? [])];
  }

  /** 左右キーで移動する。`aria-disabled` のボタンもスキップしない。スキップすると、機能しない理由を読み取る手段が無くなる。 */
  function onKeyDown(event: KeyboardEvent): void {
    const items = buttons();
    const from = items.indexOf(document.activeElement as HTMLButtonElement);
    if (from < 0) return;

    const to =
      event.key === 'ArrowRight'
        ? (from + 1) % items.length
        : event.key === 'ArrowLeft'
          ? (from - 1 + items.length) % items.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? items.length - 1
              : -1;
    if (to < 0) return;

    stop = to;
    items[to]?.focus();
    event.preventDefault();
  }

  /**
   * Tab の順路を木の先頭へ戻す（`tree.svelte.ts` の `focusPath`）。
   *
   * 絞り込みで消えた項目を指したままだと木の中に順路が 1 つも残らず、Tab でツリーへ入れなくなる。
   */
  function resetTreeFocus(): void {
    treeStore.focusPath = null;
  }

  function toggleMarkdownOnly(): void {
    if (overridden) return;
    filterStore.markdownOnly = !filterStore.markdownOnly;
    resetTreeFocus();
  }

  /**
   * 拡張子フィルターを押したとき。
   *
   * 絞り込んでいない状態で閉じるなら、閉じたことだけで済む。
   * 絞り込んでいる状態で閉じると一覧から消えている理由が画面から失われるため、まとめて解除する。
   */
  function toggleExtensions(): void {
    if (!filterStore.extensionsOpen) {
      filterStore.extensionsOpen = true;
      return;
    }
    filterStore.extensionsOpen = false;
    filterStore.extensionsInput = '';
    resetTreeFocus();
  }

  function onInput(value: string): void {
    filterStore.extensionsInput = value;
    resetTreeFocus();
  }

  /** `Esc` で入力欄を閉じ、開いたボタンへ戻る。入力欄の中身は残す。 */
  function onInputKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    filterStore.extensionsOpen = false;
    extensionsButton?.focus();
    event.stopPropagation();
  }
</script>

<div class="mx-etoolbar">
  <!--
    `tabindex="-1"` は器自体をタブ順に入れないための指定である。
    `toolbar` ロールは器がフォーカスを受けられることを要求するが、順路を持つのは中のボタン 1 つだけにしてある。
  -->
  <div
    class="mx-etoolbar__row"
    role="toolbar"
    tabindex="-1"
    aria-label={t.tree.toolbar}
    bind:this={row}
    onkeydown={onKeyDown}
  >
    <button
      type="button"
      class="mx-etoolbar__button"
      aria-label={tExplorer.newFile}
      title={tExplorer.newFile}
      onclick={() => void startCreate(false)}
    >
      <Icon name="document-plus" />
    </button>

    <button
      type="button"
      class="mx-etoolbar__button"
      aria-label={tExplorer.newFolder}
      title={tExplorer.newFolder}
      onclick={() => void startCreate(true)}
    >
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
        <path
          d="M2.4 4.2h4l1.3 1.5h5.9v6.9H2.4Z M8 7.6v3.4 M6.3 9.3h3.4"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </button>

    <span class="mx-etoolbar__separator" aria-hidden="true"></span>

    <!--
      押せなくするのではなく `aria-disabled` にしてある。
      `disabled` はフォーカスを受けられなくなるため、キーボードだけでは機能しない理由を読み取る手段が無くなる。
    -->
    <button
      type="button"
      class="mx-etoolbar__button"
      class:mx-etoolbar__button--on={filterStore.markdownOnly && !overridden}
      aria-pressed={filterStore.markdownOnly}
      aria-disabled={overridden}
      aria-label={t.tree.markdownOnly}
      title={overridden
        ? t.tree.markdownOnlyOverridden
        : t.tree.toggleState(t.tree.markdownOnly, filterStore.markdownOnly)}
      onclick={toggleMarkdownOnly}
    >
      <Icon name="markdown" />
    </button>

    <button
      type="button"
      class="mx-etoolbar__button"
      class:mx-etoolbar__button--on={overridden}
      bind:this={extensionsButton}
      aria-pressed={overridden}
      aria-expanded={filterStore.extensionsOpen}
      aria-label={t.tree.extensions}
      title={t.tree.toggleState(t.tree.extensions, overridden)}
      onclick={toggleExtensions}
    >
      <!--
        漏斗。`lib/Icon.svelte` には入れない。
        あちらは一覧の項目に添える種別の印であり、これは操作そのものの印である（`CloseIcon` と同じ区分）。
      -->
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
        <path
          d="M2.4 3.4h11.2L9.2 8.8v4.2l-2.4 1.2V8.8Z"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </button>

    <span class="mx-etoolbar__separator" aria-hidden="true"></span>

    <!-- 監視が届かない場所（ネットワークドライブなど）のために置く（ADR-0021）。 -->
    <button
      type="button"
      class="mx-etoolbar__button"
      aria-label={tExplorer.refresh}
      title={tExplorer.refresh}
      onclick={() => void reloadTree()}
    >
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
        <path
          d="M12.9 7.2A5 5 0 1 0 11.6 11.5 M13.2 3.4v3.9H9.3"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </button>

    <button
      type="button"
      class="mx-etoolbar__button"
      aria-label={tExplorer.collapseAll}
      title={tExplorer.collapseAll}
      onclick={() => {
        collapseAll();
        resetTreeFocus();
      }}
    >
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
        <path
          d="M3.4 2.6h9.2v10.8H3.4Z M5.8 8h4.4"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </button>
  </div>

  {#if filterStore.extensionsOpen}
    <input
      type="text"
      class="mx-etoolbar__input"
      bind:this={input}
      value={filterStore.extensionsInput}
      spellcheck="false"
      autocomplete="off"
      aria-label={t.tree.extensionsInput}
      placeholder={t.tree.extensionsPlaceholder}
      oninput={(event) => onInput(event.currentTarget.value)}
      onkeydown={onInputKeyDown}
    />
  {/if}
</div>

<style>
  .mx-etoolbar {
    flex: none;
    display: flex;
    flex-direction: column;
    gap: var(--mx-space-1);
    padding: 2px var(--mx-space-2) var(--mx-space-1);
    border-bottom: 1px solid var(--mx-color-border-subtle);
  }

  /* 操作が増えても縦に伸ばさない。入りきらない分だけ折り返す（ペインは 180px まで狭くなる）。 */
  .mx-etoolbar__row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--mx-space-1);
  }

  .mx-etoolbar__separator {
    align-self: center;
    width: 1px;
    height: 14px;
    margin-inline: 2px;
    background: var(--mx-color-border-subtle);
  }

  .mx-etoolbar__button {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: none;
    border-radius: var(--mx-radius-sm);
    background: none;
    color: var(--mx-color-fg-muted);
    cursor: pointer;

    &:hover {
      background: var(--mx-color-bg-hover);
      color: var(--mx-color-fg);
    }

    /* 押し込みはホバーより淡い面で表す（`app/StatusBarButton.svelte` と同じ）。 */
    &:active {
      background: var(--mx-color-bg-inset);
    }

    &:focus-visible {
      outline: 2px solid var(--mx-color-accent);
      outline-offset: -2px;
    }

    /* 効果が無いことを色でも示す。押せる見た目のまま何も起きない状態を作らない。 */
    &[aria-disabled='true'] {
      color: var(--mx-color-fg-subtle);
      cursor: default;

      &:hover {
        background: none;
        color: var(--mx-color-fg-subtle);
      }
    }
  }

  /*
   * 有効な絞り込みはアクセント色で示す。
   * 面の濃さだけで表すと、ホバー（`bg-hover`）と押し込み（`bg-inset`）に紛れて区別が付かない。
   */
  .mx-etoolbar__button--on {
    background: color-mix(in srgb, var(--mx-color-accent) 14%, transparent);
    color: var(--mx-color-accent);

    &:hover {
      background: color-mix(in srgb, var(--mx-color-accent) 22%, transparent);
      color: var(--mx-color-accent);
    }
  }

  .mx-etoolbar__input {
    width: 100%;
    min-width: 0;
    padding: var(--mx-space-1) var(--mx-space-2);
    border: 1px solid var(--mx-color-border);
    border-radius: var(--mx-radius-sm);
    background: var(--mx-color-bg);
    color: var(--mx-color-fg);
    font: inherit;
    font-size: var(--mx-font-size-ui);

    &:focus-visible {
      outline: 2px solid var(--mx-color-accent);
      outline-offset: -1px;
    }
  }
</style>
