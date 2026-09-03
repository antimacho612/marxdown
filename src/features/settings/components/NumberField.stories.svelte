<!--
  数値の項目。

  **単位は付くものと付かないものがある。** 行間は倍率（無次元）なので、
  `px` と並べると誤解を招く。
  範囲外は当てない（`min` / `max` は `appearance.ts` の `LIMITS` から来る）ので、
  「打てる」story で 8 未満や 72 超を入れても値は動かない。
-->
<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import { LIMITS } from '@/features/settings/appearance';
  import { ja } from '@/i18n/ja';

  import NumberField from './NumberField.svelte';

  const { Story } = defineMeta({
    title: '設定/components/数値の項目',
    component: NumberField,
    parameters: { layout: 'padded' },
    args: {
      label: ja.settings.fontSize,
      value: 16,
      ...LIMITS['preview.fontSize'],
      unit: ja.settings.unitPx,
      onInput: () => {},
    },
  });
</script>

<script lang="ts">
  let size = $state(16);
</script>

<Story name="既定のまま" />

<Story name="調整済み" args={{ value: 18, onReset: () => {} }} />

<!-- 行間。**単位を書かない**（倍率なので `px` と並べると誤解を招く）。 -->
<Story
  name="単位なし"
  args={{ label: ja.settings.lineHeight, value: 1.7, unit: '', ...LIMITS['preview.lineHeight'] }}
/>

<Story
  name="補足あり"
  args={{
    label: ja.settings.maxWidth,
    value: 72,
    unit: ja.settings.unitCh,
    hint: ja.settings.maxWidthHint,
    ...LIMITS['preview.maxWidth'],
  }}
/>

{#snippet live()}
  <NumberField
    label={ja.settings.fontSize}
    value={size}
    {...LIMITS['preview.fontSize']}
    unit={ja.settings.unitPx}
    onInput={(value) => (size = value)}
    onReset={size === 16 ? undefined : () => (size = 16)}
  />
{/snippet}

<Story name="打てる" template={live} parameters={{ controls: { disable: true } }} />
