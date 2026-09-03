<!--
@component
真偽値の項目。

**ラベルを「〜する」の形にして、チェックの意味を文にする。**
「ミニマップ [✓]」だと、チェックが「表示」なのか「有効」なのか読めない。

ラベル列を使わず 1 列に伸ばすのは、チェックボックスが**自分で自分を説明する**ため。
左に名前、右に四角、では同じ言葉を 2 回書くことになる。
-->

<script lang="ts">
  import { ja } from '@/i18n/ja';

  import ResetButton from './ResetButton.svelte';

  interface Props {
    label: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
    /** **渡したときだけ「既定に戻す」を出す。** 既定のままの項目には渡さない。 */
    onReset?: (() => void) | undefined;
  }

  let { label, checked, onChange, onReset }: Props = $props();
</script>

<div class="mx-settings__field mx-settings__field--full">
  <div class="mx-settings__row">
    <label class="mx-settings__toggle">
      <input type="checkbox" {checked} onchange={(e) => onChange(e.currentTarget.checked)} />
      <span>{label}</span>
    </label>
    {#if onReset}
      <ResetButton title={ja.settings.resetOf(label)} onClick={onReset} />
    {/if}
  </div>
</div>

<style>
  /* **縮ませない**（`Field.svelte` と同じ理由）。 */
  .mx-settings__field {
    flex: none;
    min-inline-size: 0;
  }

  .mx-settings__field--full {
    display: flex;
    flex-direction: column;
    gap: var(--mx-space-2);
  }

  .mx-settings__row {
    display: flex;
    align-items: center;
    gap: var(--mx-space-2);
  }

  .mx-settings__toggle {
    flex: 1;
    display: flex;
    align-items: center;
    gap: var(--mx-space-2);
  }

  .mx-settings__toggle input:focus-visible {
    outline: 2px solid var(--mx-color-accent);
    outline-offset: 1px;
  }

  .mx-settings__toggle input:disabled {
    opacity: 0.5;
  }
</style>
