<!--
@component
ステータスバーの押せる項目（03.ux-spec/07-status-and-notifications.md §3.1）。

押せる項目だけがこの見た目になる。
押しても何も起きない項目はボタンとして表示しない（BOM・読み取り専用・カーソル位置・文字数は `<span>` のままにする）。

見た目をこの 1 か所に閉じるための部品である。
使う側が `StatusBar` と `StatusMenuButton` の 2 つに分かれているため、以前は `styles/shell.css` にグローバルなクラスとして置いてあった。
部品にすることで、コンポーネント固有の CSS は `src/styles/` に置かないという方針（02.architecture/03-layers.md）に戻せる。

属性はそのまま渡す。
メニューを開く側は `aria-haspopup` / `aria-expanded` と `onkeydown` を、押すだけの側は `title` と `onclick` だけを渡す。

`class` だけは上書きではなく連結する。
`{...rest}` に任せると `mx-statusbar__button` が消え、見た目がこの部品から外れる。
渡した側のスタイルは Svelte のスコープが付かないため、参照する側は `:global()` で書く必要がある（`app/StatusBar.svelte` のフルパス）。
-->

<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';

  interface Props extends HTMLButtonAttributes {
    /** ボタンの実体。位置を測定する側とフォーカスを戻す側だけが受け取る。 */
    element?: HTMLButtonElement | undefined;
    /** 追加のクラス。基本のクラスに足す。 */
    class?: string | undefined;
    children: Snippet;
  }

  let { element = $bindable(), class: extra, children, ...rest }: Props = $props();
</script>

<button type="button" class={['mx-statusbar__button', extra]} bind:this={element} {...rest}>
  {@render children()}
</button>

<style>
  /*
   * バーの高さいっぱいを取る（`align-self: stretch`）。
   *
   * 字面ぶんの高さ（実測 14.8px）しか無いと、最大化したときに画面の下端が当たり判定にならない。
   * 端まで動かすだけで到達できることは、`app/CaptionButton.svelte` が右上で成立させているのと同じ話である。
   * 角丸を付けないのも同じ理由で、上下の端まで押せる面にする。
   */
  .mx-statusbar__button {
    align-self: stretch;
    display: inline-flex;
    align-items: center;
    padding: 0 var(--mx-space-2);
    border: none;
    background: none;
    color: inherit;
    font: inherit;
    /* 桁を揃える。倍率やカーソル位置の桁数が変わると、隣の項目が 1 文字ずつ移動する。 */
    font-variant-numeric: tabular-nums;
    cursor: pointer;
  }

  /* 開いている間は押した項目を強調したままにする（開いた元が分かるようにするため）。 */
  .mx-statusbar__button:hover,
  .mx-statusbar__button[aria-expanded='true'] {
    background: var(--mx-color-bg-hover);
    color: var(--mx-color-fg);
  }

  /* 押し込み。Windows はホバーより淡い面で押下を表す（`app/CaptionButton.svelte` と同じ）。 */
  .mx-statusbar__button:active {
    background: var(--mx-color-bg-inset);
  }

  .mx-statusbar__button:focus-visible {
    outline: 2px solid var(--mx-color-accent);
    outline-offset: -2px;
  }
</style>
