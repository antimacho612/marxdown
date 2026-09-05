<!--
@component
選択形式の設定項目。

@prop key
@prop label
@prop description
@prop value
@prop options
@prop onChange
@prop onReset?
-->

<script lang="ts">
  import Field from './Field.svelte';
  import type { Choice } from './types';

  interface Props {
    key: string;
    label: string;
    description: string;
    value: string;
    options: Choice[];
    onChange: (value: string) => void;
    /** リセット時のコールバック。未指定時は「既定に戻す」ボタン自体表示されない。 */
    onReset?: (() => void) | undefined;
  }

  let { key, label, description, value, options, onChange, onReset }: Props = $props();

  const id = $props.id();
</script>

<Field {label} labelFor={id} tooltip={key} {description} {onReset}>
  <select {id} class="mx-settings__select" {value} onchange={(e) => onChange(e.currentTarget.value)}>
    {#each options as option (option.value)}
      <option value={option.value}>{option.label}</option>
    {/each}
  </select>
</Field>

<style>
  .mx-settings__select {
    min-width: 14rem;
    padding: var(--mx-space-1) var(--mx-space-2);
    border: 1px solid var(--mx-color-border);
    border-radius: var(--mx-radius-sm);
    background: var(--mx-color-bg);
    color: var(--mx-color-fg);
    font: inherit;

    &:focus-visible {
      outline: 2px solid var(--mx-color-accent);
      outline-offset: 1px;
    }

    &:disabled {
      opacity: 0.5;
    }
  }
</style>
