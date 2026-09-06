<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import { ja } from '@/i18n/ja';

  import SelectField from './SelectField.svelte';
  import type { Choice } from './types';

  const { Story } = defineMeta({
    title: '設定/components/選択肢の項目',
    component: SelectField,
    parameters: { layout: 'padded' },
    args: {
      key: 'palette',
      label: ja.settings.palette,
      description: 'description',
      value: 'default',
      options: [],
      onChange: () => {},
    },
  });

  function choices(labels: Record<string, string>): Choice[] {
    return Object.entries(labels).map(([value, label]) => ({ value, label }));
  }

  const PALETTES = choices(ja.settings.paletteOptions);
  const WORD_WRAP = choices(ja.settings.editor.wordWrapOptions);
</script>

<script lang="ts">
  let palette = $state('default');
</script>

<Story name="既定のまま" args={{ options: PALETTES }} />

<Story name="調整済み" args={{ options: PALETTES, value: 'nord', onReset: () => {} }} />

<Story name="補足なし" args={{ label: ja.settings.editor.wordWrap, options: WORD_WRAP, value: 'on' }} />

{#snippet live()}
  <SelectField
    key="palette"
    label={ja.settings.palette}
    description="description"
    options={PALETTES}
    value={palette}
    onChange={(value) => (palette = value)}
    onReset={palette === 'default' ? undefined : () => (palette = 'default')}
  />
{/snippet}

<Story name="選べる" template={live} parameters={{ controls: { disable: true } }} />
