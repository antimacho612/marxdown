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
      label: ja.settings.fontSize.label,
      description: ja.settings.fontSize.description,
      value: 16,
      ...LIMITS['preview.fontSize'],
      onInput: () => {},
    },
  });
</script>

<script lang="ts">
  let size = $state(16);
</script>

<Story name="既定のまま" />

<Story name="調整済み" args={{ value: 18, onReset: () => {} }} />

<Story name="単位なし" args={{ label: ja.settings.lineHeight.label, value: 1.7, ...LIMITS['preview.lineHeight'] }} />

<Story
  name="補足あり"
  args={{
    label: ja.settings.maxWidth.label,
    description: ja.settings.maxWidth.description,
    value: 72,
    ...LIMITS['preview.maxWidth'],
  }}
/>

{#snippet live()}
  <NumberField
    key="preview.fontSize"
    label={ja.settings.fontSize.label}
    description={ja.settings.fontSize.description}
    value={size}
    {...LIMITS['preview.fontSize']}
    onInput={(value) => (size = value)}
    onReset={size === 16 ? undefined : () => (size = 16)}
  />
{/snippet}

<Story name="打てる" template={live} parameters={{ controls: { disable: true } }} />
