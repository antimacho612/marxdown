<!--
@component 設定項目の「既定に戻す」ボタン。
 -->

<script lang="ts">
  import { ja } from '@/i18n/ja';

  interface Props {
    onClick: () => void;
  }

  let { onClick }: Props = $props();
</script>

<button type="button" class="mx-settings__reset" title={ja.settings.reset} onclick={onClick}>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    class="lucide lucide-rotate-ccw-icon lucide-rotate-ccw"
  >
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
  </svg>
</button>

<style>
  /* 正方形にして、コントロール列の左端を揃える基準にする（`Field.svelte` の `__reset-slot` と同じ幅）。 */
  .mx-settings__reset {
    flex: none;
    inline-size: var(--mx-control-height);
    block-size: var(--mx-control-height);
    padding: 0;
    display: grid;
    place-items: center;
    border: none;
    border-radius: var(--mx-radius-sm);
    background: none;
    color: var(--mx-color-fg-muted);
    font: inherit;
    font-size: var(--mx-font-size-ui-sm);

    &:hover:not(:disabled) {
      color: var(--mx-color-fg);
      background: var(--mx-color-bg-hover);
    }

    &:active:not(:disabled) {
      background: var(--mx-color-bg-inset);
    }

    /* 親（`SettingsDialog`）のスコープはここまで届かないので、自分で持つ。 */
    &:focus-visible {
      outline: 2px solid var(--mx-color-accent);
      outline-offset: 1px;
    }

    /* `settings.json` が壊れている間は、外側の `fieldset` ごと止まる。 */
    &:disabled {
      opacity: 0.5;
    }
  }
</style>
