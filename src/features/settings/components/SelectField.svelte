<!--
@component
選択肢の項目。

**一覧と値を突き合わせ直さない。** 妥当性は Rust 側が持っていて、
知らない綴りは既定値に落ちる。
-->

<script lang="ts">
  import { ja } from '@/i18n/ja';

  import Field from './Field.svelte';
  import ResetButton from './ResetButton.svelte';
  import type { Choice } from './types';

  interface Props {
    label: string;
    value: string;
    options: Choice[];
    hint?: string;
    onChange: (value: string) => void;
    /** **渡したときだけ「既定に戻す」を出す。** 既定のままの項目には渡さない。 */
    onReset?: (() => void) | undefined;
  }

  let { label, value, options, hint = '', onChange, onReset }: Props = $props();

  const id = $props.id();
</script>

<Field {id} {label} {hint}>
  <select {id} class="mx-settings__select" {value} onchange={(e) => onChange(e.currentTarget.value)}>
    {#each options as option (option.value)}
      <option value={option.value}>{option.label}</option>
    {/each}
  </select>
  {#if onReset}
    <ResetButton title={ja.settings.resetOf(label)} onClick={onReset} />
  {/if}
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
  }

  .mx-settings__select:focus-visible {
    outline: 2px solid var(--mx-color-accent);
    outline-offset: 1px;
  }

  .mx-settings__select:disabled {
    opacity: 0.5;
  }
</style>
