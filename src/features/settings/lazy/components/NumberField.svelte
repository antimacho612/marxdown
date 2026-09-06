<!--
@component
数値の設定項目。

@prop key
@prop label
@prop description
@prop value
@prop min
@prop max
@prop step
@prop onInput
@prop onReset?
-->

<script lang="ts">
  import { SETTINGS_SCHEMA, type NumericKey } from '@/platform';

  import Field from './Field.svelte';

  interface Props {
    settingKey: NumericKey;
    label: string;
    description: string;
    value: number;
    /** 刻み幅。スキーマには無く、`layout.ts` が UI の都合で決める。 */
    step: number;
    onInput: (value: number) => void;
    /** リセット時のコールバック。未指定時は「既定に戻す」ボタン自体表示されない。 */
    onReset?: (() => void) | undefined;
  }

  let { settingKey, label, description, value, step, onInput, onReset }: Props = $props();

  const id = $props.id();

  /** 許容範囲はキーから決まる。呼び出し側に渡させるとスキーマと二重管理になる。 */
  const range = $derived(SETTINGS_SCHEMA[settingKey]);

  function handleInput(event: Event & { currentTarget: HTMLInputElement }): void {
    const next = event.currentTarget.valueAsNumber;
    if (Number.isNaN(next)) {
      return;
    }

    if (next < range.min || next > range.max) {
      return;
    }

    onInput(next);
  }
</script>

<Field {label} labelFor={id} tooltip={settingKey} {description} {onReset}>
  <input
    {id}
    type="number"
    class="mx-settings__number"
    min={range.min}
    max={range.max}
    {step}
    {value}
    oninput={handleInput}
  />
</Field>

<style>
  .mx-settings__number {
    width: 5.5rem;
    padding: var(--mx-space-1) var(--mx-space-2);
    border: 1px solid var(--mx-color-border);
    border-radius: var(--mx-radius-sm);
    background: var(--mx-color-bg);
    color: var(--mx-color-fg);
    font: inherit;
    font-variant-numeric: tabular-nums;

    &:focus-visible {
      outline: 2px solid var(--mx-color-accent);
      outline-offset: 1px;
    }

    &:disabled {
      opacity: 0.5;
    }
  }
</style>
