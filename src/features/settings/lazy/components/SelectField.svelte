<!--
@component
選択形式の設定項目。

@prop key
@prop label
@prop description
@prop value
@prop options
@prop onChange
@prop onReset?
-->

<script lang="ts" generics="K extends EnumKey">
  import { settingChoices, type EnumKey, type Settings } from '@/platform';

  import Field from './Field.svelte';

  interface Props {
    settingKey: K;
    label: string;
    description: string;
    value: Settings[K];
    /**
     * 選択肢のラベル。並び順はここでは決めない（スキーマの `values` が決める）。
     *
     * `Partial` にしているのは、`SettingsDialog` が項目のユニオンをそのまま渡すためである。
     * 過不足なく揃っていることは `layout.ts` の `Labels<K>` と `layout.test.ts` が検証する。
     */
    labels: Readonly<Partial<Record<Settings[K] & string, string>>>;
    onChange: (value: Settings[K]) => void;
    /** リセット時のコールバック。未指定時は「既定に戻す」ボタン自体表示されない。 */
    onReset?: (() => void) | undefined;
  }

  let { settingKey, label, description, value, labels, onChange, onReset }: Props = $props();

  const id = $props.id();

  const options = $derived(
    settingChoices(settingKey).map((choice) => ({ value: choice, label: labels[choice] ?? choice })),
  );
</script>

<!--
`<select>` から返るのは素の `string` なので、ここで 1 回だけ狭める。
値の妥当性は Rust 側が持っている（知らない綴りは既定値に落ちる）ので、選択肢と突き合わせ直さない。
-->
<Field {label} labelFor={id} tooltip={settingKey} {description} {onReset}>
  <select {id} class="mx-settings__select" {value} onchange={(e) => onChange(e.currentTarget.value as Settings[K])}>
    {#each options as option (option.value)}
      <option value={option.value}>{option.label}</option>
    {/each}
  </select>
</Field>

<style>
  .mx-settings__select {
    /* 列の幅は `Field.svelte` が `--mx-control-column` で決める。ここは残りを埋めるだけにする。 */
    flex: 1;
    min-inline-size: 0;
    block-size: var(--mx-control-height);
    padding: var(--mx-space-1) var(--mx-space-2);
    border: 1px solid var(--mx-color-border);
    border-radius: var(--mx-radius-sm);
    background: var(--mx-color-bg);
    color: var(--mx-color-fg);
    font: inherit;

    &:focus-visible {
      outline: 2px solid var(--mx-color-accent);
      outline-offset: 1px;
    }

    &:disabled {
      opacity: 0.5;
    }
  }
</style>
