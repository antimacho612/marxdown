<script lang="ts">
  import { ja } from '@/i18n/ja';

  interface Props {
    title: string;
    onClick?: () => void;
  }

  let { title, onClick }: Props = $props();
</script>

<button type="button" class="mx-settings__reset" {title} onclick={onClick}>
  {ja.settings.reset}
</button>

<style>
  .mx-settings__reset {
    flex: none;
    padding: 0 var(--mx-space-1);
    border: none;
    background: none;
    color: var(--mx-color-accent);
    font: inherit;
    font-size: 11px;
    cursor: default;

    &:hover:not(:disabled) {
      text-decoration: underline;
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
