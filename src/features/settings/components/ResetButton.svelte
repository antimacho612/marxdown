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
  }
</style>
