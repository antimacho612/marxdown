<!--
  見出しへジャンプ（`Ctrl+Shift+O` / 03.ux-spec/04-keybindings.md §3「移動」）。

  見出しジャンプ専用で、コマンドパレット（`Ctrl+Shift+P` / F-NAV-06 / M3）とは別物である。
  機能を登録できる仕組みは作らない（作ると M3 で「2 つのパレット」を統合し直すことになる）。
  アウトラインを見るのと見出しへ飛ぶのは別の意図なので、ペインは開かない（開くと飛んだ後に本文の幅が縮小したままになる）。
-->
<script lang="ts">
  import { documentStore } from '@/features/document';
  import { ja } from '@/i18n/ja';

  import { jumpToHeading } from '../jump';
  import { fuzzyFilter } from './fuzzy';

  interface Props {
    onclose: () => void;
  }

  const { onclose }: Props = $props();

  /**
   * 一度に描く件数。
   *
   * `huge.md` の見出しは数百個ある。
   * すべて描画しても動作するが、1 打鍵ごとに数百のノードを作り直す必要はない。
   * 絞り込めば目的の見出しは上位に表示される。
   */
  const SHOWN = 50;

  let query = $state('');
  let selected = $state(0);
  let input: HTMLInputElement | null = $state(null);
  let list: HTMLElement | null = $state(null);

  const items = $derived(documentStore.outline);
  const matches = $derived(fuzzyFilter(items, query).slice(0, SHOWN));

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

  function commit(offset: number): void {
    const item = matches[offset];
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
  キーは入力欄で受け取る。パレットが開いている間、フォーカスは常にここにある。
  外枠（`role="dialog"`）に付けると、操作対象でない要素がキーを処理することになる。
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
      {#each matches as item, offset (item.line)}
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
      {/each}
    </div>
  {/if}
</div>

<style>
  /*
   * 上寄せの中央に配置する。
   * 03.ux-spec/09-motion.md の「パレットの出現 100ms」に合わせるが、変化させるのはパレット自身の不透明度と位置だけで、本文には影響しない。
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
