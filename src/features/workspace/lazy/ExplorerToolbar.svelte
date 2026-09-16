<!--
  Explorer のツールバー（F-NAV-03 / 03.ux-spec/06-panes.md §1）。

  遅延チャンク側にある。ペインを開くまで読み込まない（`ExplorerBody.svelte`）。

  いまはフィルターの 2 つだけだが、表示更新などの操作もここに並べる。
  ボタンの見た目は `mx-etoolbar__button` に集約してあり、増やすときは要素を足すだけでよい。

  文字ラベルは置かない。ペインは 180px まで狭くなるため、操作が増えるほど折り返しで縦に伸びる。
-->
<script lang="ts">
  import { ja } from '@/i18n/ja';

  import { filterStore } from './filter.svelte';

  /** 拡張子フィルターが効いている間、Markdown フィルターは表示を変えない（`filter.svelte.ts`）。 */
  const overridden = $derived(filterStore.extensions.length > 0);

  let input: HTMLInputElement | null = $state(null);
  let extensionsButton: HTMLButtonElement | null = $state(null);

  /** 開いた直後に入力欄へフォーカスする。開いてから自分で掴み直す操作を挟ませない。 */
  $effect(() => {
    if (filterStore.extensionsOpen) input?.focus();
  });

  /**
   * ツールバー内を矢印キーで移動する（WAI-ARIA の toolbar パターン）。
   *
   * タブ順からは外さない。
   * ファイルツリーの項目もすべて `Tab` で辿れる作りであり（`FileTree.svelte`）、ここだけ別の規則にすると移動の仕方がペインの中で変わる。
   */
  function onKeydown(event: KeyboardEvent): void {
    const items = [...(event.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('button')];
    const from = items.indexOf(document.activeElement as HTMLButtonElement);
    if (from < 0 || items.length === 0) return;

    let to: number;
    switch (event.key) {
      case 'ArrowRight': {
        to = (from + 1) % items.length;
        break;
      }
      case 'ArrowLeft': {
        to = (from - 1 + items.length) % items.length;
        break;
      }
      case 'Home': {
        to = 0;
        break;
      }
      case 'End': {
        to = items.length - 1;
        break;
      }
      default: {
        return;
      }
    }

    items[to]?.focus();
    event.preventDefault();
  }

  /**
   * 拡張子フィルターを押したとき。
   *
   * 絞り込んでいない状態で閉じるなら、閉じたことだけで済む。
   * 絞り込んでいる状態で閉じると、一覧から消えている理由が画面から失われるため、まとめて解除する。
   */
  function toggleExtensions(): void {
    if (!filterStore.extensionsOpen) {
      filterStore.extensionsOpen = true;
      return;
    }
    filterStore.extensionsOpen = false;
    filterStore.extensionsInput = '';
  }

  /** `Esc` で入力欄を閉じ、開いたボタンへ戻る。入力欄の中身は残す。 */
  function onInputKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    filterStore.extensionsOpen = false;
    extensionsButton?.focus();
    event.stopPropagation();
  }
</script>

<div class="mx-etoolbar">
  <!--
    `tabindex="-1"` は器自体をタブ順に入れないための指定である。
    `toolbar` ロールは器がフォーカスを受けられることを要求するが、ここではボタンを 1 つずつ `Tab` で辿れる形にしてある。
    ファイルツリーの項目も同じ作りであり（`FileTree.svelte`）、ペインの中で移動の規則を変えない。
  -->
  <div class="mx-etoolbar__row" role="toolbar" tabindex="-1" aria-label={ja.tree.toolbar} onkeydown={onKeydown}>
    <!--
      押せなくするのではなく `aria-disabled` にしてある。
      `disabled` はフォーカスを受けられなくなるため、キーボードだけでは「なぜ効かないのか」を読み取る手段が無くなる。
    -->
    <button
      type="button"
      class="mx-etoolbar__button"
      class:mx-etoolbar__button--on={filterStore.markdownOnly && !overridden}
      aria-pressed={filterStore.markdownOnly}
      aria-disabled={overridden}
      aria-label={overridden ? ja.tree.markdownOnlyOverridden : ja.tree.markdownOnly}
      title={overridden ? ja.tree.markdownOnlyOverridden : ja.tree.markdownOnly}
      onclick={() => {
        if (!overridden) filterStore.markdownOnly = !filterStore.markdownOnly;
      }}
    >
      <!-- Markdown の記号（角丸の枠に M と下向き矢印）。16px では枠が潰れるため中の字形だけを描く。 -->
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
        <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M1.75 11.5V4.5l3 3.5 3-3.5v7" />
          <path d="M12 4.5v7" />
          <path d="M9.75 9.25 12 11.5l2.25-2.25" />
        </g>
      </svg>
    </button>

    <button
      type="button"
      class="mx-etoolbar__button"
      class:mx-etoolbar__button--on={overridden}
      bind:this={extensionsButton}
      aria-pressed={overridden}
      aria-expanded={filterStore.extensionsOpen}
      aria-label={ja.tree.extensions}
      title={ja.tree.extensions}
      onclick={toggleExtensions}
    >
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
        <path
          d="M2.25 3.25h11.5L9.25 8.75v4.25l-2.5 1.25V8.75z"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
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
      bind:value={filterStore.extensionsInput}
      spellcheck="false"
      autocomplete="off"
      aria-label={ja.tree.extensionsInput}
      placeholder={ja.tree.extensionsPlaceholder}
      onkeydown={onInputKeydown}
    />
  {/if}
</div>

<style>
  .mx-etoolbar {
    flex: none;
    display: flex;
    flex-direction: column;
    gap: var(--mx-space-1);
    padding: var(--mx-space-1) var(--mx-space-2);
    border-bottom: 1px solid var(--mx-color-border-subtle);
  }

  /* 操作が増えても縦に伸ばさない。入りきらない分は折り返す（ペインは 180px まで狭くなる）。 */
  .mx-etoolbar__row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--mx-space-1);
  }

  .mx-etoolbar__button {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
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

    &:focus-visible {
      outline: 2px solid var(--mx-color-accent);
      outline-offset: -2px;
    }

    /* 効果が無いことを色でも示す。押せる見た目のまま何も起きない状態を作らない。 */
    &[aria-disabled='true'] {
      opacity: 0.4;
      cursor: default;

      &:hover {
        background: none;
        color: var(--mx-color-fg-muted);
      }
    }
  }

  /* 有効な絞り込みは、面ではなくアクセント色で示す。狭いペインで四角い塗りが並ぶと行の境目が読みにくくなる。 */
  .mx-etoolbar__button--on {
    background: var(--mx-color-bg-inset);
    color: var(--mx-color-accent);

    &:hover {
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
