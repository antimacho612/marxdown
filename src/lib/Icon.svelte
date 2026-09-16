<!--
@component
小さな図記号。

一覧の項目に添える用途だけを想定している。
`CloseIcon` / `ChevronIcon` を別に持っているのは、あちらが「操作そのもの」の印であり、
大きさと線幅を呼び出し側の都合で動かさないためである。

線は 1.5px で固定する（13px の本文の隣に置いたとき、文字の太さと釣り合う）。
色は `currentColor` から取り、状態ごとの塗り分けは CSS 側に任せる。
-->

<script module lang="ts">
  /** 使える図記号。ここに無いものを増やす前に、その一覧に図記号が要るかを先に決める。 */
  export type IconName =
    | 'appearance'
    | 'preview'
    | 'editor'
    | 'markdown'
    | 'outline'
    | 'window'
    | 'folder'
    | 'document'
    | 'document-text'
    | 'document-plus';
</script>

<script lang="ts">
  interface Props {
    name: IconName;
    /** 一辺の長さ（px）。 */
    size?: number;
  }

  const { name, size = 16 }: Props = $props();

  /**
   * 16 の格子で描く。
   *
   * `fill` を使うのは「外観」の半月だけで、残りはすべて線である。
   * 塗りと線が混ざると、同じ一覧に並べたときに重さが揃わない。
   */
  const PATHS: Record<IconName, string> = {
    appearance: 'M8 2.2a5.8 5.8 0 1 0 0 11.6 5.8 5.8 0 1 0 0-11.6',
    preview:
      'M1.6 8s2.4-4.2 6.4-4.2S14.4 8 14.4 8s-2.4 4.2-6.4 4.2S1.6 8 1.6 8Z M9.8 8a1.8 1.8 0 1 1-3.6 0 1.8 1.8 0 0 1 3.6 0Z',
    editor: 'M11.3 2.4 13.6 4.7 5.8 12.5l-3 .7.7-3Z M9.9 3.8l2.3 2.3',
    markdown: 'M5.9 2.8 4.7 13.2 M11.3 2.8 10.1 13.2 M2.9 6.1h10.4 M2.4 9.9h10.4',
    outline: 'M2.6 3.8h10.8 M5.2 8h8.2 M7.8 12.2h5.6',
    window:
      'M2.4 4.4a1.4 1.4 0 0 1 1.4-1.4h8.4a1.4 1.4 0 0 1 1.4 1.4v7.2a1.4 1.4 0 0 1-1.4 1.4H3.8a1.4 1.4 0 0 1-1.4-1.4Z M2.4 6.4h11.2',
    folder:
      'M2.2 4.6a1.2 1.2 0 0 1 1.2-1.2h2.7l1.6 1.9h5.1a1.2 1.2 0 0 1 1.2 1.2v5.1a1.2 1.2 0 0 1-1.2 1.2H3.4a1.2 1.2 0 0 1-1.2-1.2Z',
    document: 'M3.8 2.6h5.1l3.3 3.3v7.5H3.8Z M8.9 2.6v3.3h3.3',
    'document-text': 'M3.8 2.6h5.1l3.3 3.3v7.5H3.8Z M8.9 2.6v3.3h3.3 M5.9 8.6h4.2 M5.9 10.9h2.6',
    'document-plus': 'M3.8 2.6h5.1l3.3 3.3v7.5H3.8Z M8.9 2.6v3.3h3.3 M8 8.2v3.4 M6.3 9.9h3.4',
  };

  const path = $derived(PATHS[name]);
</script>

<svg class="mx-icon" viewBox="0 0 16 16" width={size} height={size} aria-hidden="true" focusable="false">
  <path d={path} fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
  {#if name === 'appearance'}
    <!-- 半分だけ塗って「ライトとダークの切り替え」を表す。線だけでは円と区別が付かない。 -->
    <path d="M8 2.2a5.8 5.8 0 0 0 0 11.6Z" fill="currentColor" stroke="none" />
  {/if}
</svg>

<style>
  .mx-icon {
    flex: none;
  }
</style>
