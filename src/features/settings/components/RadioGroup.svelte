<!--
@component
排他の選択肢（テーマ / 閉じるときの動作）。

**素のラジオボタンにしてある。** 同じ `name` を持つラジオは、矢印キーでの移動も
`Tab` の扱い（グループ全体で 1 つ）も**ブラウザ側が実装している**。
見た目のためにボタンで組み直すと、それを自分で書き直すことになる。

`fieldset` / `legend` のままにしているのは、グループ名を読み上げに載せる方法として
いちばん確実だから。**grid の 2 列に載せない**のは `legend` の配置がブラウザ差を持つため。
-->

<script lang="ts">
  import { ja } from '@/i18n/ja';

  import ResetButton from './ResetButton.svelte';
  import type { Choice } from './types';

  interface Props {
    label: string;
    value: string;
    options: Choice[];
    onChange: (value: string) => void;
    /** **渡したときだけ「既定に戻す」を出す。** 既定のままの項目には渡さない。 */
    onReset?: (() => void) | undefined;
  }

  let { label, value, options, onChange, onReset }: Props = $props();

  /** グループの名前。**同じ画面に 2 つ置いても混ざらない**ように、実体ごとに振る。 */
  const name = $props.id();
</script>

<fieldset class="mx-settings__field mx-settings__field--full mx-settings__group">
  <div class="mx-settings__row">
    <legend class="mx-settings__label">{label}</legend>
    {#if onReset}
      <ResetButton title={ja.settings.resetOf(label)} onClick={onReset} />
    {/if}
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
  /* `fieldset` の既定（枠・余白・`min-inline-size: min-content`）を落とす。
     最後のものを消し忘れると、幅が中身に押し広げられてダイアログからはみ出す。
     **縮ませない**のは `Field.svelte` と同じ理由。 */
  .mx-settings__field {
    flex: none;
    margin: 0;
    padding: 0;
    border: none;
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

  .mx-settings__label {
    flex: 1;
    padding: 0;
    color: var(--mx-color-fg);
    font-weight: 600;
  }

  .mx-settings__choices {
    display: flex;
    flex-wrap: wrap;
    gap: var(--mx-space-1) var(--mx-space-4);
  }

  .mx-settings__choice {
    display: flex;
    align-items: center;
    gap: var(--mx-space-2);
  }

  .mx-settings__choice input:focus-visible {
    outline: 2px solid var(--mx-color-accent);
    outline-offset: 1px;
  }

  .mx-settings__choice input:disabled {
    opacity: 0.5;
  }
</style>
