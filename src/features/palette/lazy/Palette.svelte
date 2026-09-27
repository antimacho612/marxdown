<!--
  パレットの外枠（コマンドパレット `Ctrl+Shift+P` / クイックオープン `Ctrl+P` / 見出しジャンプ `Ctrl+Shift+O`）。

  中身を知らない。何を並べるかは呼び出し側が `items` で渡し、選ばれたら `onselect` が呼ばれる。

  あいまい検索は `fuzzy.ts`（同じ遅延チャンクの中）。fzf 系のライブラリは入れない。
-->
<script lang="ts">
  import { splitShortcutKeys } from '@/lib/shortcuts';

  import { fuzzyFilter } from './fuzzy';

  /** 並べる 1 行。 */
  export interface PaletteItem {
    /** `{#each}` のキー。選ばれたときに `onselect` へ渡る。 */
    id: string;
    /** 表示と照合に使う文字列。 */
    label: string;
    /**
     * 表示しない照合用の別名（コマンドの英語キーワードなど）。
     *
     * ラベルで一致したものが常に上に来る（`fuzzyFilter`）。
     * 一致した語は表示しないので、なぜその行が出ているのかは利用者からは見えない。
     * 表示しても読むものが増えるだけであり、上位に並ぶのはラベルで一致したものである。
     */
    keywords?: string;
    /** 右端に薄く出す補足（ディレクトリや見出しレベルなど）。 */
    detail?: string;
    /** 右端に出すキー。メニューと表示形式を揃えるため、`detail` とは別に持つ。 */
    shortcut?: string;
    /** 字下げの段数。見出しの階層に使う。 */
    depth?: number;
  }

  interface Props {
    /** 読み上げ名。パレットの用途そのもの。 */
    label: string;
    placeholder: string;
    items: readonly PaletteItem[];
    /** 入力欄の下に出す断り。無ければ何も描かない（クイックオープンの打ち切り）。 */
    note?: string;
    /** 1 件も無いとき（絞り込み前）の文言。 */
    emptyText: string;
    /** 絞り込みで 0 件になったときの文言。 */
    noMatchText: string;
    onselect: (id: string) => void;
    onclose: () => void;
  }

  const { label, placeholder, items, note, emptyText, noMatchText, onselect, onclose }: Props = $props();

  /**
   * 一度に描く件数。
   *
   * `huge.md` の見出しは数百個ある。すべて描画しても動作するが、1 打鍵ごとに数百のノードを作り直す必要はない。絞り込めば目的の行は上位に表示される。
   */
  const SHOWN = 50;

  let query = $state('');
  let selected = $state(0);
  let input: HTMLInputElement | null = $state(null);
  let list: HTMLElement | null = $state(null);

  const matches = $derived(
    fuzzyFilter(items, query, (item) =>
      item.keywords === undefined ? [item.label] : [item.label, item.keywords],
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

  function commit(offset: number): void {
    const item = matches[offset];
    if (!item) return;
    // 閉じてから実行する。順序を逆にすると、実行結果がパレットの下に隠れる。
    onclose();
    onselect(item.id);
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
<div class="mx-palette" role="dialog" aria-modal="true" aria-label={label} data-tauri-drag-region="ignore">
  <input
    bind:this={input}
    bind:value={query}
    class="mx-palette__input"
    type="text"
    role="combobox"
    aria-expanded="true"
    aria-controls="mx-palette-list"
    aria-label={label}
    {placeholder}
    spellcheck="false"
    autocomplete="off"
    onkeydown={onKeyDown}
  />

  {#if note}
    <p class="mx-palette__note">{note}</p>
  {/if}

  {#if matches.length === 0}
    <p class="mx-palette__empty">{items.length === 0 ? emptyText : noMatchText}</p>
  {:else}
    <!--
      選択肢は `<button>` にしておく。`tabindex="-1"` で Tab の順路からは外し、移動は上下キー（入力欄から）に一本化する。
      押せるものは `<button>` にするという原則をここでも守る。
    -->
    <div class="mx-palette__list" id="mx-palette-list" role="listbox" bind:this={list}>
      {#each matches as item, offset (item.id)}
        <button
          type="button"
          role="option"
          tabindex="-1"
          aria-selected={offset === selected}
          class:mx-palette__item--selected={offset === selected}
          style:padding-inline-start="calc(var(--mx-space-3) + {(item.depth ?? 0) * 12}px)"
          onclick={() => commit(offset)}
        >
          <span class="mx-palette__text">{item.label}</span>
          {#if item.detail}
            <span class="mx-palette__detail">{item.detail}</span>
          {/if}
          {#if item.shortcut}
            <span class="mx-palette__shortcut">
              {#each splitShortcutKeys(item.shortcut) as key (key)}<kbd>{key}</kbd>{/each}
            </span>
          {/if}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  /*
   * 上寄せの中央に配置する。
   * モーションの規則の「パレットの出現 100ms」に合わせるが、変化させるのはパレット自身の不透明度と位置だけで、本文には影響しない。
   */
  .mx-palette {
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
    /* 内側の入力欄は 4px、その外に 8px の余白があるため、外側は 12px にする（同心の角丸）。 */
    border-radius: calc(var(--mx-radius-sm) + var(--mx-space-2));
    background: var(--mx-color-bg-subtle);
    box-shadow: var(--mx-shadow-1);
    font-size: var(--mx-font-size-ui);
    animation: mx-palette-in 100ms ease-out;
  }

  @keyframes mx-palette-in {
    from {
      opacity: 0;
      translate: -50% -4px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .mx-palette {
      animation: none;
    }
  }

  .mx-palette__input {
    flex: none;
    padding: var(--mx-space-2);
    border: 1px solid var(--mx-color-border);
    border-radius: var(--mx-radius-sm);
    background: var(--mx-color-bg);
    color: var(--mx-color-fg);
    font: inherit;
  }

  .mx-palette__input:focus-visible {
    outline: none;
    border-color: var(--mx-color-accent);
  }

  .mx-palette__note {
    margin: var(--mx-space-2) 0 0;
    color: var(--mx-color-fg-subtle);
    font-size: var(--mx-font-size-ui-sm);
  }

  .mx-palette__empty {
    margin: 0;
    padding: var(--mx-space-3);
    color: var(--mx-color-fg-muted);
  }

  .mx-palette__list {
    margin: var(--mx-space-2) 0 0;
    padding: 0;
    overflow-y: auto;
    list-style: none;
  }

  .mx-palette__list button {
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

  .mx-palette__list button:hover {
    background: var(--mx-color-bg-hover);
  }

  .mx-palette__list button:active {
    background: var(--mx-color-bg-inset);
  }

  /* ホバー中の面（`bg-hover`）では subtle が 4.5:1 に届かない。1 段上げる。 */
  .mx-palette__list button:hover :is(.mx-palette__detail, .mx-palette__shortcut) {
    color: var(--mx-color-fg-muted);
  }

  /*
   * 現在の候補。印はアウトライン・メニュー・タブと同じものを使う（`--mx-current-marker`）。
   * 同じ意味の印を、一覧ごとに違う見た目にしない。
   */
  .mx-palette__item--selected {
    box-shadow: var(--mx-current-marker);
    background: var(--mx-color-bg-inset);
    color: var(--mx-color-fg);
  }

  .mx-palette__text {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .mx-palette__detail {
    flex: none;
    margin-inline-start: var(--mx-space-2);
    color: var(--mx-color-fg-subtle);
    font-size: var(--mx-font-size-ui-sm);
  }

  .mx-palette__shortcut {
    display: inline-flex;
    flex: none;
    gap: var(--mx-space-1);
    margin-inline-start: var(--mx-space-2);
    color: var(--mx-color-fg-subtle);
  }
</style>
