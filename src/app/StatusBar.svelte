<!--
  ステータスバー（03.ux-spec/07-status-and-notifications.md §3）。

  ```text
  Preview   UTF-8  LF   12,345 文字   約 4 分            100%
  ```

  押せるのは倍率だけ（§3.1 の表）。エンコーディングの再解釈も EOL の変換も
  ドキュメントの書き戻しに触るので M2 以降であり、**押しても何も起きないものを
  ボタンに見せない**。カーソル位置は Preview では出ない（§3 の但し書き）。

  計測値（パース / 描画）は開発ビルドでのみ出す。開発中の道具であって、
  製品の画面に居座る理由が説明できない（06.roadmap/invariants.md）。
-->
<script lang="ts">
  import { documentStore } from '@/features/document/store.svelte';
  import { formatZoom, zoomReset } from '@/features/preview/zoom';
  import { viewStore } from '@/features/view/store.svelte';
  import { ja } from '@/i18n/ja';

  const meta = $derived(documentStore.meta);
  const textStats = $derived(documentStore.textStats);
  const stats = $derived(documentStore.stats);
</script>

<footer class="mx-statusbar">
  {#if meta}
    <span>{ja.status.mode}</span>
    <span>{meta.encoding.toUpperCase()}</span>
    <span>{meta.eol.toUpperCase()}</span>
    {#if meta.bom}<span>BOM</span>{/if}
    {#if meta.readonly}<span>{ja.status.readonly}</span>{/if}
    {#if textStats}
      <span>{ja.status.chars(textStats.chars)}</span>
      <span>{ja.status.readingTime(textStats.readingMinutes)}</span>
    {/if}
  {/if}

  <span class="mx-statusbar__spacer"></span>

  {#if import.meta.env.DEV && stats}
    <span>{stats.site}{stats.chunks > 1 ? ` / ${stats.chunks} chunks` : ''}</span>
    <span>{ja.status.parsedIn(stats.parseMs)}</span>
    <span>{ja.status.paintedIn(stats.paintMs)}</span>
  {/if}

  <!--
    表示倍率（F-VIEW-11）。**クリックで等倍に戻る**（§3）。

    倍率が 100% のときも出しておく。「今は等倍だ」と分かることと、
    押せる場所がいつも同じ位置にあることのほうが、1 項目減らすより価値がある。
  -->
  {#if meta}
    <button type="button" class="mx-statusbar__button" onclick={() => void zoomReset()} title={ja.status.zoomReset}>
      {formatZoom(viewStore.zoom)}
    </button>
  {/if}
</footer>

<style>
  .mx-statusbar {
    grid-area: statusbar;
    display: flex;
    align-items: center;
    gap: var(--mx-space-4);
    padding-inline: var(--mx-space-4);
    border-top: 1px solid var(--mx-color-border-subtle);
    background: var(--mx-color-bg-subtle);
    color: var(--mx-color-fg-muted);
    font-size: 11px;
    white-space: nowrap;
    min-width: 0;
    overflow: hidden;
  }

  .mx-statusbar__spacer {
    flex: 1;
  }

  /*
   * 押せる項目（03.ux-spec/07-status-and-notifications.md §3.1）。
   *
   * 押せるものだけがこの見た目になる。いま押せるのは倍率だけ。
   * 押しても何も起きない項目をボタンに見せない。
   */
  .mx-statusbar__button {
    padding: 0 var(--mx-space-2);
    border: none;
    border-radius: var(--mx-radius-sm);
    background: none;
    color: inherit;
    font: inherit;
    font-variant-numeric: tabular-nums;
    cursor: pointer;
  }

  .mx-statusbar__button:hover {
    background: var(--mx-color-bg-hover);
    color: var(--mx-color-fg);
  }

  .mx-statusbar__button:focus-visible {
    outline: 2px solid var(--mx-color-accent);
    outline-offset: -2px;
  }
</style>
