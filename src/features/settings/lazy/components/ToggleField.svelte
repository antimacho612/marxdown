<!--
@component
真偽値の設定項目。

@prop key
@prop label
@prop description
@prop checked
@prop onChange
-->

<script lang="ts">
  import type { BooleanKey } from '@/platform';

  import Field from './Field.svelte';

  interface Props {
    settingKey: BooleanKey;
    label: string;
    description: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
  }

  let { settingKey, label, description, checked, onChange }: Props = $props();

  const id = $props.id();

  function handleClick() {
    onChange(!checked);
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key !== 'Enter' && e.key !== ' ') {
      return;
    }

    e.preventDefault();
    onChange(!checked);
  }
</script>

<Field {label} labelFor={id} tooltip={settingKey} {description}>
  <button
    type="button"
    role="switch"
    {id}
    class="mx-settings__toggle"
    class:mx-settings__toggle--checked={checked}
    aria-checked={checked}
    aria-label={label}
    onclick={handleClick}
    onkeydown={handleKeyDown}
  >
    <span class="mx-settings__toggle__thumb" aria-hidden="true"></span>
  </button>
</Field>

<style>
  .mx-settings__toggle {
    flex: none;
    position: relative;
    margin: 0;
    padding: 0;
    height: 24px;
    width: 44px;
    display: inline-flex;
    align-items: center;
    border: 1px solid var(--mx-color-border);
    border-radius: 9999px;
    background: var(--mx-color-bg);
    cursor: pointer;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
    vertical-align: middle;
    transition:
      background-color 200ms ease,
      border-color 200ms ease;

    &:focus-visible {
      outline: 2px solid var(--mx-color-accent);
      outline-offset: 1px;
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  .mx-settings__toggle__thumb {
    position: absolute;
    left: 2px;
    top: 50%;
    width: 18px;
    height: 18px;
    transform: translateY(-50%);
    border-radius: 9999px;
    background: var(--mx-color-fg-muted);
    box-shadow: var(--mx-shadow-1);
    pointer-events: none;
    transition:
      transform 200ms cubic-bezier(0.4, 0, 0.2, 1),
      background-color 200ms ease;
  }

  .mx-settings__toggle--checked {
    background: var(--mx-color-accent);

    .mx-settings__toggle__thumb {
      background: light-dark(var(--mx-color-accent-fg), var(--mx-color-fg));
      transform: translateY(-50%) translateX(20px);
    }
  }
</style>
