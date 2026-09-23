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
  /*
   * 項目より前に来る区切りなので、上だけ余白を足す。
   *
   * 上の 20px（`__pane` の `gap`）に 20px を足して 40px にする。
   * 項目どうしの間隔のちょうど 2 倍で、節の切れ目が罫線を読まなくても分かる。
   */
  .mx-settings__section {
    margin: var(--mx-space-5) 0 0;
    padding-bottom: var(--mx-space-2);
    border-bottom: 1px solid var(--mx-color-border-subtle);
    font-size: var(--mx-font-size-ui);
    font-weight: 600;
    letter-spacing: 0.01em;
    color: var(--mx-color-fg-muted);

    &:first-child {
      margin-top: 0;
    }
  }
</style>
