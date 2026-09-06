<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import { ja } from '@/i18n/ja';
  import type { Palette, WordWrap } from '@/platform';

  import SelectField from './SelectField.svelte';

  /**
   * 選択肢は部品がスキーマから引くので、story 側で並べない。
   * どのキーを描くかで選択肢が変わるため、`args` ではなくテンプレートで渡している。
   */
  const { Story } = defineMeta({
    title: '設定/components/選択肢の項目',
    component: SelectField,
    parameters: { layout: 'padded', controls: { disable: true } },
  });
</script>

<script lang="ts">
  let palette = $state<Palette>('default');
</script>

{#snippet paletteField(value: Palette, onReset?: () => void)}
  <SelectField
    settingKey="preview.theme"
    label={ja.settings.palette}
    description={ja.settings.paletteHint}
    labels={ja.settings.paletteOptions}
    {value}
    onChange={() => {}}
    {onReset}
  />
{/snippet}

{#snippet asDefault()}
  {@render paletteField('default')}
{/snippet}

<Story name="既定のまま" template={asDefault} />

{#snippet customized()}
  {@render paletteField('nord', () => {})}
{/snippet}

<Story name="調整済み" template={customized} />

{#snippet noDescription()}
  <SelectField
    settingKey="editor.wordWrap"
    label={ja.settings.editor.wordWrap}
    description=""
    labels={ja.settings.editor.wordWrapOptions}
    value={'on' satisfies WordWrap}
    onChange={() => {}}
  />
{/snippet}

<Story name="補足なし" template={noDescription} />

{#snippet live()}
  <SelectField
    settingKey="preview.theme"
    label={ja.settings.palette}
    description={ja.settings.paletteHint}
    labels={ja.settings.paletteOptions}
    value={palette}
    onChange={(value) => (palette = value)}
    onReset={palette === 'default' ? undefined : () => (palette = 'default')}
  />
{/snippet}

<Story name="選べる" template={live} />
