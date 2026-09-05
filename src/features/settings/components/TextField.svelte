<!--
@component
文字列の設定項目。

@prop key
@prop label
@prop description
@prop value
@prop placeholder
@prop inputmode
@prop onInput
@prop onReset
-->

<script lang="ts">
  import Field from './Field.svelte';

  interface Props {
    key: string;
    label: string;
    description: string;
    value: string;
    placeholder?: string;
    inputmode?: 'text' | 'numeric';
    onInput: (value: string) => void;
    /** リセット時のコールバック。未指定時は「既定に戻す」ボタン自体表示されない。 */
    onReset?: (() => void) | undefined;
  }

  let { key, label, description, value, placeholder = '', inputmode = 'text', onInput, onReset }: Props = $props();

  const id = $props.id();
</script>

<Field {label} labelFor={id} tooltip={key} {description} {onReset}>
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

    &:focus-visible {
      outline: 2px solid var(--mx-color-accent);
      outline-offset: 1px;
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }
</style>
