<!--
  見出しへジャンプ（`Ctrl+Shift+O` / 03.ux-spec.md §5.3「移動」）。

  ```text
        ┌────────────────────────────────┐
        │ きど                            │
        ├────────────────────────────────┤
        │ 起動シーケンス                  │
        │   コールド起動                  │
        │   ウォーム起動                  │
        └────────────────────────────────┘
  ```

  # コマンドパレットではない

  **これは見出しジャンプ専用**（06.roadmap.md §5.5）。コマンドパレット
  （`Ctrl+Shift+P` / F-NAV-06）は M3 のままで、ここに機能を登録できる仕組みは作らない。
  作ると、M3 で「2 つのパレット」を統合し直すことになる。

  # ペインを開かない

  アウトラインを**見る**のと、見出しへ**飛ぶ**のは別の意図である。
  ジャンプするためにペインを開くと、飛んだ後に本文が横に詰まったままになる。
-->
<script lang="ts">
  import { documentStore } from '@/features/document/store.svelte';
  import { ja } from '@/i18n/ja';
  import type { OutlineItem } from '@/markdown/plugins/line-map';

  import { fuzzyFilter } from './fuzzy';
  import { jumpToHeading } from './jump';

  interface Props {
    onclose: () => void;
  }

  const { onclose }: Props = $props();

  /**
   * 一度に描く件数。
   *
   * `huge.md` の見出しは数百個ある。全部描いても破綻はしないが、
   * **1 打鍵ごとに数百のノードを作り直す**理由が無い。絞り込めば上位に出る。
   */
  const SHOWN = 50;

  let query = $state('');
  let selected = $state(0);
  let input: HTMLInputElement | null = $state(null);
  let list: HTMLElement | null = $state(null);

  const items = $derived(documentStore.outline);
  const matches = $derived(
    fuzzyFilter(
      items.map((item) => item.text),
      query,
    ).slice(0, SHOWN),
  );

  /** 絞り込みが変わると、いま選んでいる行は意味を失う。先頭へ戻す。 */
  let seenQuery = '';

  $effect(() => {
    if (query === seenQuery) return;
    seenQuery = query;
    selected = 0;
  });

  /** 選択が画面外へ出ないようにする。キーボードだけで最後まで辿れること。 */
  $effect(() => {
    list?.querySelectorAll('button')[selected]?.scrollIntoView({ block: 'nearest' });
  });

  $effect(() => {
    input?.focus();
  });

  function itemAt(offset: number): OutlineItem | null {
    const match = matches[offset];
    if (!match) return null;
    return items[match.index] ?? null;
  }

  function commit(offset: number): void {
    const item = itemAt(offset);
    if (!item) return;
    // 閉じてから飛ぶ。順序を逆にすると、飛んだ先がパレットの下に隠れる
    onclose();
    jumpToHeading(item);
  }

  function onKeyDown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowDown': {
        selected = Math.min(selected + 1, matches.length - 1);
        break;
      }
      case 'ArrowUp': {
        selected = Math.max(selected - 1, 0);
        break;
      }
      case 'Home': {
        selected = 0;
        break;
      }
      case 'End': {
        selected = matches.length - 1;
        break;
      }
      case 'Enter': {
        commit(selected);
        break;
      }
      case 'Escape': {
        onclose();
        break;
      }
      default: {
        return;
      }
    }

    event.preventDefault();
  }
</script>

<!--
  キーは**入力欄**で受ける。パレットが開いている間、フォーカスは必ずここにある。
  外枠（`role="dialog"`）に付けると、意味的に押せない要素がキーを扱うことになる。
-->
<div class="mx-jump" role="dialog" aria-modal="true" aria-label={ja.outline.jump} data-tauri-drag-region="ignore">
  <input
    bind:this={input}
    bind:value={query}
    class="mx-jump__input"
    type="text"
    role="combobox"
    aria-expanded="true"
    aria-controls="mx-jump-list"
    aria-label={ja.outline.jump}
    placeholder={ja.outline.jumpPlaceholder}
    spellcheck="false"
    autocomplete="off"
    onkeydown={onKeyDown}
  />

  {#if matches.length === 0}
    <p class="mx-jump__empty">{items.length === 0 ? ja.outline.empty : ja.outline.jumpNoMatch}</p>
  {:else}
    <!--
      選択肢は `<button>` にしておく。`tabindex="-1"` で Tab の順路からは外し、
      移動は上下キー（入力欄から）に一本化する。押せるものが `<button>` である、
      という当たり前をここでも崩さない。
    -->
    <div class="mx-jump__list" id="mx-jump-list" role="listbox" bind:this={list}>
      {#each matches as match, offset (match.index)}
        {@const item = items[match.index]}
        {#if item}
          <button
            type="button"
            role="option"
            tabindex="-1"
            aria-selected={offset === selected}
            class:mx-jump__item--selected={offset === selected}
            style:padding-inline-start="calc(var(--mx-space-3) + {(item.level - 1) * 12}px)"
            onclick={() => commit(offset)}
          >
            <span class="mx-jump__text">{item.text}</span>
            <span class="mx-jump__level">H{item.level}</span>
          </button>
        {/if}
      {/each}
    </div>
  {/if}
</div>

<style>
  /*
   * 上寄せの中央。§10 の「パレットの出現 100ms」に合わせるが、
   * 動かすのは**パレット自身の不透明度と位置だけ**で、本文には触れない。
   */
  .mx-jump {
    position: fixed;
    top: calc(var(--mx-titlebar-height) + var(--mx-space-4));
    left: 50%;
    translate: -50% 0;
    z-index: 50;

    display: flex;
    flex-direction: column;
    width: min(560px, 90vw);
    max-height: 60vh;
    padding: var(--mx-space-2);
    border: 1px solid var(--mx-color-border);
    border-radius: var(--mx-radius);
    background: var(--mx-color-bg-subtle);
    box-shadow: var(--mx-shadow-1);
    font-size: var(--mx-font-size-ui);
    animation: mx-jump-in 100ms ease-out;
  }

  @keyframes mx-jump-in {
    from {
      opacity: 0;
      translate: -50% -4px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .mx-jump {
      animation: none;
    }
  }

  .mx-jump__input {
    flex: none;
    padding: var(--mx-space-2);
    border: 1px solid var(--mx-color-border);
    border-radius: var(--mx-radius-sm);
    background: var(--mx-color-bg);
    color: var(--mx-color-fg);
    font: inherit;
  }

  .mx-jump__input:focus-visible {
    outline: none;
    border-color: var(--mx-color-accent);
  }

  .mx-jump__empty {
    margin: 0;
    padding: var(--mx-space-3);
    color: var(--mx-color-fg-muted);
  }

  .mx-jump__list {
    margin: var(--mx-space-2) 0 0;
    padding: 0;
    overflow-y: auto;
    list-style: none;
  }

  .mx-jump__list button {
    display: flex;
    align-items: center;
    width: 100%;
    padding-block: 4px;
    padding-inline-end: var(--mx-space-3);
    border: none;
    border-radius: var(--mx-radius-sm);
    background: none;
    color: var(--mx-color-fg-muted);
    font: inherit;
    text-align: start;
    cursor: pointer;
  }

  .mx-jump__text {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .mx-jump__list button:hover {
    background: var(--mx-color-bg-hover);
  }

  .mx-jump__item--selected {
    background: var(--mx-color-selection);
    color: var(--mx-color-fg);
  }

  .mx-jump__level {
    margin-inline-start: var(--mx-space-2);
    color: var(--mx-color-fg-subtle);
    font-size: 11px;
  }
</style>
