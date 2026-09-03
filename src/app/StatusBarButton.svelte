<!--
@component
ステータスバーの押せる項目（03.ux-spec/07-status-and-notifications.md §3.1）。

**押せるものだけがこの見た目になる。** 押しても何も起きない項目をボタンに見せない
（BOM・読み取り専用・カーソル位置・文字数は素の `<span>` のまま）。

見た目をここ 1 つに閉じるための部品である。使う側が `StatusBar` と
`StatusMenuButton` の 2 つに分かれているため、以前は `styles/shell.css` に
グローバルなクラスとして置いてあった。**部品にすれば
「コンポーネント固有の CSS は `src/styles/` に置かない」**（02.architecture/03-layers.md）
に戻せる。

属性はそのまま素通しする。メニューを開く側は `aria-haspopup` / `aria-expanded` と
`onkeydown` を、押すだけの側は `title` と `onclick` だけを渡す。
-->

<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';

  interface Props extends HTMLButtonAttributes {
    /** ボタンの実体。**位置を測る / フォーカスを戻す側だけ**が受け取る。 */
    element?: HTMLButtonElement | undefined;
    children: Snippet;
  }

  let { element = $bindable(), children, ...rest }: Props = $props();
</script>

<button type="button" class="mx-statusbar__button" bind:this={element} {...rest}>
  {@render children()}
</button>

<style>
  .mx-statusbar__button {
    padding: 0 var(--mx-space-2);
    border: none;
    border-radius: var(--mx-radius-sm);
    background: none;
    color: inherit;
    font: inherit;
    /* 桁を揃える。倍率やカーソル位置が揺れると、隣の項目が 1 文字ずつ動く。 */
    font-variant-numeric: tabular-nums;
    cursor: pointer;
  }

  /* 開いている間は押した項目を光らせたままにする（どこから開いたかが分かる）。 */
  .mx-statusbar__button:hover,
  .mx-statusbar__button[aria-expanded='true'] {
    background: var(--mx-color-bg-hover);
    color: var(--mx-color-fg);
  }

  .mx-statusbar__button:focus-visible {
    outline: 2px solid var(--mx-color-accent);
    outline-offset: -2px;
  }
</style>
