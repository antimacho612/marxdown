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
  /*
   * 寸法は Windows 11 の ToggleSwitch（40x20）に合わせてある。
   * 寸法が異なると、Windows のアプリの中でここだけ他のプラットフォームの部品に見える。
   */
  .mx-settings__toggle {
    flex: none;
    position: relative;
    margin: 0;
    padding: 0;
    height: 20px;
    width: 40px;
    display: inline-flex;
    align-items: center;
    border: 1px solid var(--mx-color-border);
    border-radius: 9999px;
    background: var(--mx-color-bg);
    cursor: pointer;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
    vertical-align: middle;
    /* 高頻度の操作なので 150ms を上限にする（03.ux-spec/09-motion.md §1 の基準: 本文のレイアウトに触らない）。 */
    transition:
      background-color 150ms ease-out,
      border-color 150ms ease-out;

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
    left: 3px;
    top: 50%;
    width: 12px;
    height: 12px;
    transform: translateY(-50%);
    border-radius: 9999px;
    background: var(--mx-color-fg-muted);
    pointer-events: none;
    transition:
      transform 150ms cubic-bezier(0.2, 0, 0, 1),
      background-color 150ms ease-out;
  }

  .mx-settings__toggle:hover {
    border-color: var(--mx-color-fg-subtle);
  }

  .mx-settings__toggle--checked {
    border-color: var(--mx-color-accent);
    background: var(--mx-color-accent);

    .mx-settings__toggle__thumb {
      background: light-dark(var(--mx-color-accent-fg), var(--mx-color-fg));
      transform: translateY(-50%) translateX(22px);
    }
  }

  .mx-settings__toggle--checked:hover {
    border-color: var(--mx-color-accent-hover);
    background: var(--mx-color-accent-hover);
  }

  .mx-settings__toggle:active {
    background: var(--mx-color-bg-inset);
  }

  .mx-settings__toggle--checked:active {
    background: var(--mx-color-accent-active);
    border-color: var(--mx-color-accent-active);
  }

  /*
   * 動きを伴う他の部品（通知バー・パレット・設定ダイアログ・プレビュー・見出しジャンプ）と同じく、`prefers-reduced-motion` を尊重する（03.ux-spec/10-accessibility.md）。
   */
  @media (prefers-reduced-motion: reduce) {
    .mx-settings__toggle,
    .mx-settings__toggle__thumb {
      transition: none;
    }
  }
</style>
