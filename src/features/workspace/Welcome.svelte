<!--
  引数なしで起動したときの画面（F-OPEN-03 / F-OPEN-09 / 03.ux-spec/08-empty-states.md §1）。

  ```text
  Marxdown

  ファイルを開く          Ctrl+O

  最近開いたファイル
    README.md            ~/repos/marxdown
    00.design-brief.md   ~/repos/marxdown/docs.local

  ここに Markdown ファイルをドロップ
  ```

  チュートリアルもツアーも出さない。**ショートカットを併記することが唯一の教育**。

  「フォルダを開く」（M3）と「新規ファイル」（M2）はまだ並べていない。
  押しても何も起きない項目を置くのは Principle 3 に反する。
-->
<script lang="ts">
  import Mark from '@/app/Mark.svelte';
  import { openPath, openViaDialog } from '@/features/document/open';
  import { ja } from '@/i18n/ja';
  import { splitPath } from '@/lib/path';

  import { recentStore } from './recent.svelte';

  /**
   * 一覧に出す件数。ストアはもっと保持している（`store.rs` の `RECENT_LIMIT`）。
   *
   * 少なく見せるのは意図的で、§1 のスケッチも 3 件。
   * ここが長い一覧になった瞬間、Welcome 画面は「履歴ビューア」という別の道具になる。
   */
  const RECENT_SHOWN = 6;

  const shown = $derived(recentStore.entries.slice(0, RECENT_SHOWN));
</script>

<div class="mx-welcome">
  <div class="mx-welcome__panel">
    <h1 class="mx-welcome__title">
      <Mark size={30} />
      {ja.welcome.title}
    </h1>

    <button type="button" class="mx-welcome__action" onclick={() => void openViaDialog()}>
      <span>{ja.welcome.openFile}</span>
      <kbd>Ctrl+O</kbd>
    </button>

    <section class="mx-welcome__recent">
      <h2 class="mx-welcome__heading">{ja.welcome.recent}</h2>
      {#if shown.length === 0}
        <p class="mx-welcome__empty">{ja.welcome.noRecent}</p>
      {:else}
        <ul class="mx-welcome__list">
          {#each shown as entry (entry.path)}
            {@const split = splitPath(entry.path)}
            <li>
              <!-- 開けなかった場合の通知と履歴からの除去は `openPath` の担当。 -->
              <button
                type="button"
                class="mx-welcome__item"
                onclick={() => void openPath(entry.path)}
                title={entry.path}
              >
                <span class="mx-welcome__item-name">{split.name}</span>
                <span class="mx-welcome__item-dir">{split.dir}</span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <p class="mx-welcome__hint">{ja.welcome.dropHint}</p>
    <p class="mx-welcome__hint"><code>{ja.welcome.cliHint}</code></p>
  </div>
</div>

<style>
  /*
   * 中央寄せではなく**左揃えのブロックを中央に置く**。
   * 項目とショートカットが縦に揃わないと、一覧として読めない。
   */
  .mx-welcome {
    grid-area: main;
    z-index: 5;
    display: grid;
    place-content: center;
    background: var(--mx-color-bg);
    overflow-y: auto;
  }

  .mx-welcome__panel {
    display: flex;
    flex-direction: column;
    gap: var(--mx-space-3);
    width: min(30rem, 80vw);
    padding: var(--mx-space-8) 0;
  }

  .mx-welcome__title {
    display: flex;
    align-items: center;
    gap: var(--mx-space-3);
    margin: 0 0 var(--mx-space-2);
    font-size: 22px;
    font-weight: 650;
    letter-spacing: -0.01em;
    color: var(--mx-color-fg);
  }

  .mx-welcome__heading {
    margin: var(--mx-space-4) 0 var(--mx-space-1);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--mx-color-fg-subtle);
  }

  /* 「ファイルを開く   Ctrl+O」— 動作とショートカットを両端に置いて対応づける */
  .mx-welcome__action {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--mx-space-4);
    padding: var(--mx-space-2) var(--mx-space-3);
    margin-inline: calc(-1 * var(--mx-space-3));
    border: none;
    border-radius: var(--mx-radius);
    background: none;
    color: var(--mx-color-accent);
    font: inherit;
    font-size: var(--mx-font-size-ui);
    text-align: start;
    cursor: pointer;
  }

  .mx-welcome__list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .mx-welcome__item {
    display: flex;
    align-items: baseline;
    gap: var(--mx-space-3);
    width: 100%;
    padding: var(--mx-space-1) var(--mx-space-3);
    margin-inline: calc(-1 * var(--mx-space-3));
    border: none;
    border-radius: var(--mx-radius-sm);
    background: none;
    color: var(--mx-color-fg);
    font: inherit;
    font-size: var(--mx-font-size-ui);
    text-align: start;
    cursor: pointer;
  }

  .mx-welcome__item-name {
    flex: none;
  }

  /* ディレクトリは補助情報。長いパスは頭を削って末尾（＝現在地）を残す */
  .mx-welcome__item-dir {
    flex: 1;
    min-width: 0;
    color: var(--mx-color-fg-subtle);
    font-size: 11px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    direction: rtl;
    text-align: start;
  }

  .mx-welcome__action:hover,
  .mx-welcome__item:hover {
    background: var(--mx-color-bg-hover);
  }

  .mx-welcome__action:focus-visible,
  .mx-welcome__item:focus-visible {
    outline: 2px solid var(--mx-color-accent);
    outline-offset: -2px;
  }

  .mx-welcome__empty,
  .mx-welcome__hint {
    margin: 0;
    color: var(--mx-color-fg-subtle);
    font-size: var(--mx-font-size-ui);
  }

  .mx-welcome__hint:first-of-type {
    margin-top: var(--mx-space-4);
  }
</style>
