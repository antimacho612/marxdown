<!--
@component
選択形式の設定項目。

選択肢が 4 つ以下 かつ 選択肢のラベルが長すぎず、長さがおおよそ揃っている場合に使う。
選択肢が多い場合やラベルが長い選択肢があるときは、`SelectField` コンポーネントを使用する。

@prop label
@prop description
@prop value
@prop options
@prop onChange
-->

<script lang="ts" generics="K extends EnumKey">
  import { settingChoices, type EnumKey, type Settings } from '@/platform';

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
  }

  let { settingKey, label, description, value, labels, onChange }: Props = $props();

  const name = $props.id();

  const options = $derived(
    settingChoices(settingKey).map((choice) => ({ value: choice, label: labels[choice] ?? choice })),
  );
</script>

<fieldset class="mx-settings__field">
  <div class="mx-settings__label">
    <legend>{label}</legend>
    <p class="mx-settings__description">{description}</p>
  </div>

  <div class="mx-settings__control">
    <!-- 「既定に戻す」の場所。ここには無いが、他の項目とコントロールの左端を揃えるために空けておく（`Field.svelte`）。 -->
    <span class="mx-settings__reset-slot" aria-hidden="true"></span>

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
  </div>
</fieldset>

<style>
  .mx-settings__field {
    flex: none;
    min-inline-size: 0;
    margin: 0;
    padding: 0;
    border: none;
    display: grid;
    /* 列幅は `Field.svelte` と同じ。設定を上から下へ読むときの揃える辺を 1 本に保つ。 */
    grid-template-columns: 1fr var(--mx-control-column);
    align-items: start;
    gap: var(--mx-space-1) var(--mx-space-3);

    @media (max-width: 720px) {
      grid-template-columns: 1fr;
    }
  }

  .mx-settings__label {
    display: flex;
    flex-direction: column;
    /* ラベルと説明は 1 つの項目なので、項目どうしの間隔（20px）よりはっきり近づける。 */
    gap: var(--mx-space-1);
    color: var(--mx-color-fg);
    font-weight: 600;
  }

  /* 11px で 1.35 は詰まりすぎる。2 行に折り返す説明が多い。 */
  .mx-settings__description {
    margin: 0;
    color: var(--mx-color-fg-subtle);
    font-size: var(--mx-font-size-ui-sm);
    line-height: 1.5;
  }

  /* `Field.svelte` と同じ構造。scoped `<style>` の都合で CSS は共有できず、値はトークンで揃える。 */
  .mx-settings__control {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--mx-space-2);
    min-inline-size: 0;
  }

  .mx-settings__reset-slot {
    flex: none;
    inline-size: var(--mx-control-height);
  }

  .mx-settings__choices {
    position: relative;
    flex: 1;
    min-inline-size: 0;
    block-size: var(--mx-control-height);
    /* 内側に 2px。選んだ側の面が溝の縁に触れると、入れ物と中身の境目が消える。 */
    padding: 2px;
    display: flex;
    background: var(--mx-color-bg-inset);
    border-radius: var(--mx-radius);
  }

  /* 角丸は外側から padding を引いた値にする（外 6px = 内 4px + 余白 2px）。 */
  .mx-settings__choice {
    position: relative;
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding-inline: var(--mx-space-2);
    border: 1px solid transparent;
    border-radius: var(--mx-radius-sm);
    color: var(--mx-color-fg-muted);
    font-weight: 500;
    user-select: none;
    cursor: pointer;

    input {
      position: absolute;
      width: 1px;
      height: 1px;
      opacity: 0;
      margin: 0;
    }

    &:has(input:checked) {
      border-color: var(--mx-color-border);
      background: var(--mx-color-bg);
      color: var(--mx-color-fg);
    }

    &:has(input:not(:checked):not(:disabled)):hover {
      color: var(--mx-color-fg);
    }

    &:has(input:focus-visible) {
      outline: 2px solid var(--mx-color-accent);
      outline-offset: 1px;
    }

    &:has(input:disabled) {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }
</style>
