<!--
@component
設定項目

入力欄そのものは持たない。
ここにあるのはラベルと補足と枠だけで、中身は呼び出し側が `children` に置く。

@prop children
@prop label
@prop labelFor
@prop tooltip
@prop description
@prop onReset?
-->

<script lang="ts">
  import type { Snippet } from 'svelte';

  import ResetButton from './ResetButton.svelte';

  interface Props {
    children: Snippet;
    label: string;
    labelFor: string;
    tooltip: string;
    description: string;
    /** リセット時のコールバック。未指定時は「既定に戻す」ボタン自体表示されない。 */
    onReset?: (() => void) | undefined;
  }

  let { tooltip, labelFor, label, description, onReset, children }: Props = $props();
</script>

<div class="mx-settings__field">
  <label class="mx-settings__label" for={labelFor}>
    <span title={tooltip}>{label}</span>
    <p class="mx-settings__description">{description}</p>
  </label>

  <div class="mx-settings__control">
    <!--
      「既定に戻す」の場所は、ボタンが無い項目でも空けておく。
      詰めると、リセットのある項目と無い項目でコントロールの左辺がずれる。
    -->
    {#if onReset}
      <ResetButton onClick={onReset} />
    {:else}
      <span class="mx-settings__reset-slot" aria-hidden="true"></span>
    {/if}
    {@render children()}
  </div>
</div>

<style>
  .mx-settings__field {
    flex: none;
    min-inline-size: 0;
    display: grid;
    /*
     * コントロール列の幅を固定する。
     * 部品の自然幅に任せると、select(224px) / 入力(154px) / 数値(88px) / トグル(40px) で
     * 左辺が 180px の幅にわたってぶれ、上から下へ読むときに揃える辺が無くなる。
     */
    grid-template-columns: 1fr var(--mx-control-column);
    align-items: start;
    gap: var(--mx-space-1) var(--mx-space-3);

    @media (max-width: 720px) {
      grid-template-columns: 1fr;
    }
  }

  .mx-settings__label {
    display: flex;
    flex-direction: column;
    gap: var(--mx-space-2);
    color: var(--mx-color-fg);
    font-weight: 600;
  }

  .mx-settings__description {
    margin: 0;
    color: var(--mx-color-fg-subtle);
    font-size: var(--mx-font-size-ui-sm);
  }

  .mx-settings__control {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--mx-space-2);
    min-inline-size: 0;
  }

  .mx-settings__reset-slot {
    flex: none;
    inline-size: var(--mx-control-height);
  }
</style>
