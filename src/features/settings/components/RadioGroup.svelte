<!--
@component
選択形式の設定項目。

選択肢が 4 つ以下 かつ 選択肢のラベルが長すぎず、長さがおおよそ揃っている場合に使う。
選択肢が多い場合やラベルが長い選択肢があるときは、`SelectField` コンポーネントを使用する。

@prop label
@prop description
@prop value
@prop options
@prop onChange
-->

<script lang="ts">
  import type { Choice } from './types';

  interface Props {
    label: string;
    description: string;
    value: string;
    options: Choice[];
    onChange: (value: string) => void;
  }

  let { label, description, value, options, onChange }: Props = $props();

  const name = $props.id();
</script>

<fieldset class="mx-settings__field">
  <div class="mx-settings__label">
    <legend>{label}</legend>
    <p class="mx-settings__description">{description}</p>
  </div>

  <div class="mx-settings__choices">
    {#each options as option (option.value)}
      <label class="mx-settings__choice">
        <input
          type="radio"
          {name}
          value={option.value}
          checked={value === option.value}
          onchange={() => onChange(option.value)}
        />
        <span>{option.label}</span>
      </label>
    {/each}
  </div>
</fieldset>

<style>
  .mx-settings__field {
    flex: none;
    min-inline-size: 0;
    margin: 0;
    padding: 0;
    border: none;
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

  .mx-settings__choices {
    position: relative;
    /* padding: var(--mx-space-1); */
    display: flex;
    background: var(--mx-color-bg-inset);
    border-radius: var(--mx-radius);
  }

  .mx-settings__choice {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: var(--mx-space-1) var(--mx-space-3);
    border: 1px solid transparent;
    border-radius: var(--mx-radius);
    color: var(--mx-color-fg-muted);
    font-weight: 500;
    user-select: none;
    cursor: pointer;

    input {
      position: absolute;
      width: 1px;
      height: 1px;
      opacity: 0;
      margin: 0;
    }

    &:has(input:checked) {
      border-color: var(--mx-color-border);
      background: var(--mx-color-bg);
      color: var(--mx-color-fg);
    }

    &:has(input:not(:checked):not(:disabled)):hover {
      color: var(--mx-color-fg);
    }

    &:has(input:focus-visible) {
      outline: 2px solid var(--mx-color-accent);
      outline-offset: 1px;
    }

    &:has(input:disabled) {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }
</style>
