<!--
@component
項目 1 つぶんの器（ADR-0011）。**ラベル列 + 操作列の 2 列**。

1 列に積むとエディタの 22 項目でスクロールが長くなりすぎ、「どこに何があるか」を
覚えられなくなる（M1.5 の 6 項目では成立していた）。

**入力欄そのものは持たない。** ここにあるのはラベルと補足と枠だけで、
中身は呼び出し側が `children` に置く。`id` を外から受け取るのはそのためで、
ラベルが指す先を持っているのは常に呼び出し側である。
-->

<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    /** ラベルが指す入力欄の id。 */
    id: string;
    label: string;
    /** 補足。**既定値のままで完成している項目には書かない**（空文字なら出さない）。 */
    hint?: string;
    /** 操作列の 1 行目。入力欄・単位・「既定に戻す」がここに並ぶ。 */
    children: Snippet;
  }

  let { id, label, hint = '', children }: Props = $props();
</script>

<div class="mx-settings__field">
  <label class="mx-settings__label" for={id}>{label}</label>
  <div class="mx-settings__control">
    <div class="mx-settings__row">{@render children()}</div>
    {#if hint}<p class="mx-settings__hint">{hint}</p>{/if}
  </div>
</div>

<style>
  /* **縮ませない。** 縦に積んだ flex の子は既定で縮む（親の `.mx-settings__pane` は
     コンポーネントの外にあり、そちらの指定はここまで届かない）。 */
  .mx-settings__field {
    flex: none;
    min-inline-size: 0;
    display: grid;
    grid-template-columns: 10rem minmax(0, 1fr);
    align-items: start;
    gap: var(--mx-space-1) var(--mx-space-3);
  }

  /* 入力欄の 1 行目と高さを揃える。`align-items: center` にすると、
     補足が付いた項目でラベルが下がって隣とずれる。 */
  .mx-settings__label {
    padding: 5px 0 0;
    color: var(--mx-color-fg-muted);
  }

  .mx-settings__control {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--mx-space-1);
  }

  .mx-settings__row {
    display: flex;
    align-items: center;
    gap: var(--mx-space-2);
  }

  .mx-settings__hint {
    margin: 0;
    color: var(--mx-color-fg-subtle);
    font-size: 11px;
  }
</style>
