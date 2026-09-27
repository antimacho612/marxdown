<!--
  カスタムタイトルバー。
  `decorations: false`（`src-tauri/src/window.rs`）により、この 1 行が OS タイトルバーの代わりになる。
  中央領域は `center` スニペットとして外部に公開してあり、タブストリップはここへ差し込む（`shell.css` の grid は変更不要）。
  `data-tauri-drag-region="deep"` により、掴めばネイティブドラッグ、ダブルクリックで最大化になる（`<button>` は自動的に除外される）。
  ボタン以外の要素を含む開いたメニューパネルは `MenuButton.svelte` 側でドラッグ領域から除外している。
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  import { isSatellite } from '@/features/view';
  import { t } from '@/i18n';

  import MenuButton from './MenuButton.svelte';
  import WindowControls from './WindowControls.svelte';

  interface Props {
    /**
     * 中央領域。タブストリップ（`features/workspace/TabStrip.svelte`）が入る。
     * 1 枚でも差し込むため、渡されないのは 1 つも開いていないときだけである。
     * そのときはアプリ名を表示する。
     *
     * `undefined` を明示的に渡せる形にしてある。差し込む側は「1 枚でもあるか」で切り替えるため、省略ではなく `undefined` の代入になる（`exactOptionalPropertyTypes`）。
     */
    center?: Snippet | undefined;
  }

  const { center }: Props = $props();
</script>

<header class="mx-titlebar" data-tauri-drag-region="deep">
  <!--
    サテライトにはハンバーガーメニューを置かない（F-OPEN-06 / ADR-0016 §3）。
    並ぶ項目の多くがサテライトでは意味を持たず（フォルダを開く / ペインの開閉）、残りはキーとコマンドパレットから到達できる。
  -->
  {#if !isSatellite()}
    <MenuButton />
  {/if}

  <div class="mx-titlebar__center">
    {#if center}
      {@render center()}
    {:else}
      <span class="mx-titlebar__name">{t.app.name}</span>
    {/if}
  </div>

  <WindowControls />
</header>

<style>
  /*
   * 領域は名前で指定する（`shell.css` の `grid-template-areas`）。
   * 本文が DOM 上で先に来る（クロームのマウントを待たずに描画できる）ため、DOM 順とレイアウト順は一致しない。
   *
   * `z-index` はメニューのパネルのために指定する。
   * パネル側ではなくここに置くことで、タイトルバーから開くものを本文より手前に表示する指定が 1 か所にまとまる。
   */
  .mx-titlebar {
    grid-area: titlebar;
    position: relative;
    z-index: 40;
    display: flex;
    align-items: stretch;
    border-bottom: 1px solid var(--mx-color-border-subtle);
    background: var(--mx-color-bg-subtle);
    font-size: var(--mx-font-size-ui);
    min-width: 0;
  }

  /*
   * 中央領域。1 枚でも開いていればタブストリップに置き換わる。
   *
   * `min-width: 0` が必要である。これが無いと、タブが縮まずにウィンドウ操作ボタンを画面外へ押し出す。
   */
  .mx-titlebar__center {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: var(--mx-space-2);
    padding-inline: var(--mx-space-2);
  }

  .mx-titlebar__name {
    font-weight: 600;
    white-space: nowrap;
  }
</style>
