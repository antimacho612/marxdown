<!--
  カスタムタイトルバー（03.ux-spec/01-screen-layout.md §1）。
  `decorations: false`（`src-tauri/src/window.rs`）により、この 1 行が OS タイトルバーの代わりになる（06.roadmap/m1.5-shell-and-settings.md §2）。
  中央領域は `center` スニペットとして外部に公開してあり、タブストリップはここへ差し込む（`shell.css` の grid は変更不要）。
  `data-tauri-drag-region="deep"` により、掴めばネイティブドラッグ、ダブルクリックで最大化になる（`<button>` は自動的に除外される）。
  ボタン以外の要素を含む開いたメニューパネルは `MenuButton.svelte` 側でドラッグ領域から除外している。
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  import { documentStore } from '@/features/document';
  import { isSatellite } from '@/features/view';
  import { ja } from '@/i18n/ja';
  import { splitPath } from '@/lib/path';

  import MenuButton from './MenuButton.svelte';
  import WindowControls from './WindowControls.svelte';

  interface Props {
    /**
     * 中央領域。タブストリップ（`features/workspace/TabStrip.svelte`）が入る。
     * 渡されなければ、開いているファイル名を表示する（タブが 1 枚のときの表示）。
     *
     * `undefined` を明示的に渡せる形にしてある。差し込む側は「2 枚以上か」で切り替えるため、
     * 省略ではなく `undefined` の代入になる（`exactOptionalPropertyTypes`）。
     */
    center?: Snippet | undefined;
  }

  const { center }: Props = $props();

  const meta = $derived(documentStore.meta);
  const split = $derived(splitPath(meta?.path ?? ''));
  const dirty = $derived(documentStore.isDirty);

  /**
   * ファイル名の位置に出す文字列。
   *
   * まだ一度も保存していない文書（`Ctrl+N`）にはパスが無いため、名前として「無題」を表示する（`features/document/new.ts`）。
   * 何も開いていないときはアプリ名を表示する。
   */
  const name = $derived(meta === null ? ja.app.name : meta.path === null ? ja.titlebar.untitled : split.name);
</script>

<header class="mx-titlebar" data-tauri-drag-region="deep">
  <!--
    サテライトにはハンバーガーメニューを置かない（F-OPEN-06 / 決定 8）。
    並ぶ項目の多くがサテライトでは意味を持たず（フォルダを開く / ペインの開閉）、残りはキーとコマンドパレットから到達できる。
  -->
  {#if !isSatellite()}
    <MenuButton />
  {/if}

  <div class="mx-titlebar__center">
    {#if center}
      {@render center()}
    {:else}
      <span class="mx-titlebar__name">{name}</span>
      <!--
        未保存の印（03.ux-spec/07-status-and-notifications.md §1）。ファイル名の右に `●` を表示する。

        ステータスバーには表示しない（§1 の表が「変更なし」と定めている）。
        タブが 2 枚以上あるときは、この印はタブ側に出る（`TabStrip.svelte`）。
      -->
      {#if meta && dirty}
        <span class="mx-titlebar__dirty" title={ja.save.dirtyLabel} aria-label={ja.save.dirtyLabel}>●</span>
      {/if}
      <!-- ディレクトリは保存後に表示する。無題の文書にはパスが無い。 -->
      {#if meta && meta.path !== null}
        <span class="mx-titlebar__dir">{split.dir}</span>
      {/if}
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
   * 中央領域。2 枚以上のときはタブストリップに置き換わる。
   *
   * `min-width: 0` が必要である。これが無いと、長いパスが縮まずにウィンドウ操作ボタンを画面外へ押し出す。
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

  /*
   * 未保存の印。本文と同じ色にはしない。
   * 常時表示されるものではないため、表示されたときに気づく程度の強さがあればよい。
   */
  .mx-titlebar__dirty {
    color: var(--mx-color-fg-muted);
    font-size: 10px;
    line-height: 1;
  }

  .mx-titlebar__dir {
    color: var(--mx-color-fg-subtle);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }
</style>
