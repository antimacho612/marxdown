<!--
  タブストリップ（F-NAV-01, 02 / 03.ux-spec/01-screen-layout.md §2）。
  タイトルバーの中央領域（`TitleBar.svelte` の `center`）に差し込まれる。

  **2 枚以上のときしか描かれない。** 出し分けは差し込む側（`app/App.svelte`）が行う。
  1 枚のときはタイトルバーが既定のファイル名表示のままであり、この経路を通らない（§1「タブも 1 枚のうちは出さない」）。

  タブそのものはボタンで構成する。
  タイトルバーは `data-tauri-drag-region="deep"` でネイティブドラッグを掴む領域だが、`<button>` は自動的に除外されるため、タブを押しても窓が動かない。
  逆にタブが並んでいない余白は掴めるままになる。
-->
<script lang="ts">
  import { ja } from '@/i18n/ja';
  import { splitPath } from '@/lib/path';

  import { activateTab, closeTab, isTabDirty, tabMeta, tabsStore, type Tab } from './tabs.svelte';

  /**
   * 表示する名前。無題の文書（`Ctrl+N`）にはパスが無い。
   *
   * ディレクトリは出さない。
   * 同名のファイルを見分ける手段は `title`（ツールチップ）に寄せ、横幅は枚数のために使う。
   */
  function nameOf(tab: Tab): string {
    const path = tabMeta(tab).path;
    return path === null ? ja.titlebar.untitled : splitPath(path).name;
  }
</script>

<div class="mx-tabs" role="tablist" aria-label={ja.tab.list}>
  {#each tabsStore.tabs as tab (tab.id)}
    {@const name = nameOf(tab)}
    {@const active = tab.id === tabsStore.activeId}
    <div class="mx-tab" class:mx-tab--active={active}>
      <button
        type="button"
        class="mx-tab__label"
        role="tab"
        aria-selected={active}
        title={tabMeta(tab).path ?? name}
        onclick={() => void activateTab(tab.id)}
      >
        <span class="mx-tab__name">{name}</span>
        {#if isTabDirty(tab)}
          <span class="mx-tab__dirty" aria-label={ja.save.dirtyLabel}>●</span>
        {/if}
      </button>
      <button
        type="button"
        class="mx-tab__close"
        title={ja.tab.close(name)}
        aria-label={ja.tab.close(name)}
        onclick={() => void closeTab(tab.id)}
      >
        ✕
      </button>
    </div>
  {/each}
</div>

<style>
  /*
   * 枚数が増えたら横へスクロールさせる。
   * 幅を等分すると、2 枚のときと 10 枚のときで同じタブの位置が変わり、位置で覚えられなくなる。
   */
  .mx-tabs {
    display: flex;
    align-items: stretch;
    min-width: 0;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .mx-tabs::-webkit-scrollbar {
    display: none;
  }

  .mx-tab {
    display: flex;
    align-items: center;
    max-width: 14rem;
    border-right: 1px solid var(--mx-color-border-subtle);
    color: var(--mx-color-fg-muted);
  }

  /*
   * 選択中のタブは本文と地続きに見せる。
   * 下線ではなく背景で表すのは、タイトルバーの下端が本文との境界線になっているためである。
   */
  .mx-tab--active {
    background: var(--mx-color-bg);
    color: var(--mx-color-fg);
  }

  .mx-tab__label {
    display: flex;
    align-items: center;
    gap: var(--mx-space-1);
    min-width: 0;
    padding: 0 var(--mx-space-1) 0 var(--mx-space-2);
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    line-height: var(--mx-titlebar-height);
    cursor: pointer;
  }

  .mx-tab__name {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  /* 未保存の印。タイトルバーの `●` と同じ扱い（気づく程度の強さがあればよい）。 */
  .mx-tab__dirty {
    color: var(--mx-color-fg-muted);
    font-size: 10px;
    line-height: 1;
  }

  /*
   * 閉じるボタンは常に置く。
   * ホバーしたときだけ現れる形にすると、押せる位置が事前に分からず、タブの幅も変わる。
   */
  .mx-tab__close {
    display: flex;
    align-items: center;
    padding-inline: var(--mx-space-1);
    border: 0;
    background: none;
    color: var(--mx-color-fg-subtle);
    font: inherit;
    font-size: 10px;
    line-height: var(--mx-titlebar-height);
    cursor: pointer;
  }

  .mx-tab__close:hover {
    color: var(--mx-color-fg);
  }
</style>
