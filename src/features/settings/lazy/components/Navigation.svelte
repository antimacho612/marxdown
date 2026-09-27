<!--
@component 設定ダイアログのナビゲーション
-->

<script lang="ts">
  import { ja } from '@/i18n/ja';
  import Icon, { type IconName } from '@/lib/Icon.svelte';
  import { getPlatform } from '@/platform';

  import type { CategoryId } from '../layout';

  /**
   * カテゴリごとの図記号。
   *
   * 数の少ない一覧に図記号を追加するのは、数を数えるためではなく位置で覚えられるようにするためである。
   * 語の長さが揃っていない縦並びでは、左端の形が目印になる。
   */
  const ICONS: Record<CategoryId, IconName> = {
    application: 'appearance',
    preview: 'preview',
    editor: 'editor',
    markdown: 'markdown',
    explorer: 'folder',
    outline: 'outline',
  };

  interface Props {
    items: readonly { id: CategoryId; label: string }[];
    selected?: CategoryId;
    onSelectionChange?: (id: CategoryId) => void;
  }

  let { items, selected, onSelectionChange }: Props = $props();
</script>

<!--
タブの ARIA ロールにしていない。
`tablist` を名乗ると矢印キーでの移動を自分で実装する義務が生まれる。
素のボタンなら `Tab` だけで全部に届き、実装は 0 行で済む。
-->
<nav class="mx-settings__nav" aria-label={ja.settings.title}>
  <!-- `<main>` にしない。文書に 1 つだけ置くランドマークであり、ナビゲーションの内側に来るものではない。 -->
  <div class="mx-settings__categories">
    {#each items as item (item.id)}
      <button
        type="button"
        class="mx-settings__category"
        class:mx-settings__category--current={selected === item.id}
        aria-current={selected === item.id ? 'true' : undefined}
        onclick={() => onSelectionChange?.(item.id)}
      >
        <Icon name={ICONS[item.id]} />
        <span>{item.label}</span>
      </button>
    {/each}
  </div>

  <footer>
    <button type="button" class="mx-settings__openjson" onclick={() => void getPlatform().openSettingsFile()}>
      {ja.settings.edit}↗
    </button>
  </footer>
</nav>

<style>
  .mx-settings__nav {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    overflow: hidden;
    border-inline-end: 1px solid var(--mx-color-border-subtle);

    .mx-settings__categories {
      flex: 1 1 auto;
      display: flex;
      overflow-y: auto;
      flex-direction: column;
      padding: var(--mx-space-3) var(--mx-space-2);
      gap: 2px;
    }

    footer {
      flex: 0 0 auto;
      display: grid;
      place-items: center;
      border-top: 1px solid var(--mx-color-border-subtle);
      padding: var(--mx-space-2);
    }
  }

  .mx-settings__category {
    display: flex;
    align-items: center;
    gap: var(--mx-space-2);
    padding: var(--mx-space-2) var(--mx-space-3);
    border: none;
    border-radius: var(--mx-radius-sm);
    background: none;
    color: var(--mx-color-fg-muted);
    font: inherit;
    text-align: start;
    cursor: default;

    &:hover {
      background: var(--mx-color-bg-hover);
      color: var(--mx-color-fg);
    }

    &:active {
      background: var(--mx-color-bg-inset);
    }
  }

  /*
   * 選択中。
   * ホバーと同じ背景色だけで表すと、ポインタを乗せている項目と区別が付かない。
   * 一覧の現在位置の印（`--mx-current-marker`）を使う。
   */
  .mx-settings__category--current,
  .mx-settings__category--current:hover {
    background: var(--mx-color-bg-inset);
    box-shadow: var(--mx-current-marker);
    color: var(--mx-color-fg);
    font-weight: 600;
  }

  .mx-settings__category--current :global(.mx-icon) {
    color: var(--mx-color-accent);
  }

  .mx-settings__openjson {
    padding: var(--mx-space-2) var(--mx-space-3);
    border: none;
    border-radius: var(--mx-radius-sm);
    background: none;
    color: var(--mx-color-fg-muted);
    font: inherit;
    text-align: start;
    cursor: default;

    &:hover {
      background: var(--mx-color-bg-hover);
      color: var(--mx-color-fg);
    }

    &:active {
      background: var(--mx-color-bg-inset);
    }
  }
</style>
