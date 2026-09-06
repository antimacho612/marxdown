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
    {#if onReset}<ResetButton onClick={onReset} />{/if}
    {@render children()}
  </div>
</div>

<style>
  .mx-settings__field {
    flex: none;
    min-inline-size: 0;
    display: grid;
    grid-template-columns: 1fr auto;
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
    font-size: 11px;
  }

  .mx-settings__control {
    flex: 0;
    display: flex;
    align-items: center;
    gap: var(--mx-space-1);
  }
</style>
