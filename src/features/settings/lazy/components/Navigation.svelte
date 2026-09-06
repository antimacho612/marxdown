<!--
@component 設定ダイアログのナビゲーション
-->

<script lang="ts">
  import { ja } from '@/i18n/ja';
  import { getPlatform } from '@/platform';

  import type { CategoryId } from '../layout';

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
素のボタンなら `Tab` だけで全部に届き、実装は 0 行で済む（03.ux-spec/10-accessibility.md「すべての操作がキーボードで到達可能」）。
-->
<nav class="mx-settings__nav" aria-label={ja.settings.title}>
  <main>
    {#each items as item (item.id)}
      <button
        type="button"
        class="mx-settings__category"
        class:mx-settings__category--current={selected === item.id}
        aria-current={selected === item.id ? 'true' : undefined}
        onclick={() => onSelectionChange?.(item.id)}
      >
        {item.label}
      </button>
    {/each}
  </main>

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

    main {
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
  }

  .mx-settings__category--current {
    background: var(--mx-color-bg-hover);
    color: var(--mx-color-fg);
    font-weight: 600;
  }

  .mx-settings__openjson {
    padding: var(--mx-space-1) var(--mx-space-2);
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
  }
</style>
