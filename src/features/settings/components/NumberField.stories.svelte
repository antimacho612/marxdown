<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import { ja } from '@/i18n/ja';
  import { SETTINGS_SCHEMA, type NumericKey } from '@/platform';

  import NumberField from './NumberField.svelte';

  /** 刻み幅はスキーマに無い（UI の都合なので `features/settings/layout.ts` が持つ）。 */
  function range(key: NumericKey, step: number): { min: number; max: number; step: number } {
    const { min, max } = SETTINGS_SCHEMA[key];
    return { min, max, step };
  }

  const { Story } = defineMeta({
    title: '設定/components/数値の項目',
    component: NumberField,
    parameters: { layout: 'padded' },
    args: {
      label: ja.settings.fontSize.label,
      description: ja.settings.fontSize.description,
      value: 16,
      ...range('preview.fontSize', 1),
      onInput: () => {},
    },
  });
</script>

<script lang="ts">
  let size = $state(16);
</script>

<Story name="既定のまま" />

<Story name="調整済み" args={{ value: 18, onReset: () => {} }} />

<Story
  name="単位なし"
  args={{ label: ja.settings.lineHeight.label, value: 1.7, ...range('preview.lineHeight', 0.05) }}
/>

<Story
  name="補足あり"
  args={{
    label: ja.settings.maxWidth.label,
    description: ja.settings.maxWidth.description,
    value: 72,
    ...range('preview.maxWidth', 1),
  }}
/>

{#snippet live()}
  <NumberField
    key="preview.fontSize"
    label={ja.settings.fontSize.label}
    description={ja.settings.fontSize.description}
    value={size}
    {...range('preview.fontSize', 1)}
    onInput={(value) => (size = value)}
    onReset={size === 16 ? undefined : () => (size = 16)}
  />
{/snippet}

<Story name="打てる" template={live} parameters={{ controls: { disable: true } }} />
