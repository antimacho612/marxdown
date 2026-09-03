<!--
@component
文字列の項目（フォント名・縦罫線）。

**値は一方向にだけ流す。** `bind:` で結ぶと、打っている途中の文字列が
ストアを経由して書き戻され、変換中の文字やカンマが消える。
-->

<script lang="ts">
  import { ja } from '@/i18n/ja';

  import Field from './Field.svelte';
  import ResetButton from './ResetButton.svelte';

  interface Props {
    label: string;
    value: string;
    hint?: string;
    placeholder?: string;
    /** 数字だけを打つ欄（縦罫線）では数字向けのキーボードを出す。 */
    inputmode?: 'text' | 'numeric';
    onInput: (value: string) => void;
    /** **渡したときだけ「既定に戻す」を出す。** 既定のままの項目には渡さない。 */
    onReset?: (() => void) | undefined;
  }

  let { label, value, hint = '', placeholder = '', inputmode = 'text', onInput, onReset }: Props = $props();

  const id = $props.id();
</script>

<Field {id} {label} {hint}>
  <input
    {id}
    type="text"
    class="mx-settings__text"
    spellcheck="false"
    autocomplete="off"
    {placeholder}
    {inputmode}
    {value}
    oninput={(e) => onInput(e.currentTarget.value)}
  />
  {#if onReset}
    <ResetButton title={ja.settings.resetOf(label)} onClick={onReset} />
  {/if}
</Field>

<style>
  .mx-settings__text {
    flex: 1;
    padding: var(--mx-space-1) var(--mx-space-2);
    border: 1px solid var(--mx-color-border);
    border-radius: var(--mx-radius-sm);
    background: var(--mx-color-bg);
    color: var(--mx-color-fg);
    font: inherit;
  }

  .mx-settings__text:focus-visible {
    outline: 2px solid var(--mx-color-accent);
    outline-offset: 1px;
  }

  /* `settings.json` が壊れている間は、外側の `fieldset` ごと止まる。 */
  .mx-settings__text:disabled {
    opacity: 0.5;
  }
</style>
