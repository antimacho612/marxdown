<!--
@component 節の見出し
-->

<script lang="ts">
  interface Props {
    label: string;
  }

  let { label }: Props = $props();
</script>

<h3 class="mx-settings__section">{label}</h3>

<style>
  /* 項目より前に来る区切りなので、上だけ余白を足す。 */
  .mx-settings__section {
    margin: var(--mx-space-2) 0 0;
    padding-bottom: var(--mx-space-1);
    border-bottom: 1px solid var(--mx-color-border-subtle);
    font-size: var(--mx-font-size-ui);
    font-weight: 600;
    color: var(--mx-color-fg-muted);

    &:first-child {
      margin-top: 0;
    }
  }
</style>
