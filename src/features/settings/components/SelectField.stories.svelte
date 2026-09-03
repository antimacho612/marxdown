<!--
  選択肢の項目。

  **一覧と値を突き合わせ直さない。** 妥当性は Rust 側が持っていて、
  知らない綴りは既定値に落ちる。ここで見たいのは幅（`min-width: 14rem`）と、
  「既定に戻す」が隣に並んだときの収まり。
-->
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
      label: ja.settings.palette,
      value: 'default',
      options: [],
      hint: ja.settings.paletteHint,
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

<Story name="補足なし" args={{ label: ja.settings.editor.wordWrap, options: WORD_WRAP, value: 'on', hint: '' }} />

{#snippet live()}
  <SelectField
    label={ja.settings.palette}
    options={PALETTES}
    hint={ja.settings.paletteHint}
    value={palette}
    onChange={(value) => (palette = value)}
    onReset={palette === 'default' ? undefined : () => (palette = 'default')}
  />
{/snippet}

<Story name="選べる" template={live} parameters={{ controls: { disable: true } }} />
