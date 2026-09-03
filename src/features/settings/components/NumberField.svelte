<!--
@component
数値の項目。単位と補足だけが違うので 1 つにまとめてある。

**行間には単位を書かない**（`preview.lineHeight` / `editor.lineHeight`）。
倍率（無次元）なので、`px` と並べると誤解を招く。
-->

<script lang="ts">
  import { ja } from '@/i18n/ja';

  import Field from './Field.svelte';
  import ResetButton from './ResetButton.svelte';

  interface Props {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    /** 単位。空文字なら出さない（行間は無次元なので書かない）。 */
    unit?: string;
    hint?: string;
    /** **空欄や範囲外では呼ばない**（打っている途中の状態を潰さない）。 */
    onInput: (value: number) => void;
    /** **渡したときだけ「既定に戻す」を出す。** 既定のままの項目には渡さない。 */
    onReset?: (() => void) | undefined;
  }

  let { label, value, min, max, step, unit = '', hint = '', onInput, onReset }: Props = $props();

  const id = $props.id();

  function onNumberInput(event: Event & { currentTarget: HTMLInputElement }): void {
    const next = event.currentTarget.valueAsNumber;
    if (Number.isNaN(next)) return;
    if (next < min || next > max) return;
    onInput(next);
  }
</script>

<Field {id} {label} {hint}>
  <input {id} type="number" class="mx-settings__number" {min} {max} {step} {value} oninput={onNumberInput} />
  {#if unit}<span class="mx-settings__unit">{unit}</span>{/if}
  {#if onReset}
    <ResetButton title={ja.settings.resetOf(label)} onClick={onReset} />
  {/if}
</Field>

<style>
  /* **スピナーのぶんを含めて幅を取る。** `7ch` だと `100` が最後の桁で切れる。 */
  .mx-settings__number {
    width: 5.5rem;
    padding: var(--mx-space-1) var(--mx-space-2);
    border: 1px solid var(--mx-color-border);
    border-radius: var(--mx-radius-sm);
    background: var(--mx-color-bg);
    color: var(--mx-color-fg);
    font: inherit;
    font-variant-numeric: tabular-nums;
  }

  .mx-settings__number:focus-visible {
    outline: 2px solid var(--mx-color-accent);
    outline-offset: 1px;
  }

  .mx-settings__number:disabled {
    opacity: 0.5;
  }

  .mx-settings__unit {
    color: var(--mx-color-fg-subtle);
  }
</style>
