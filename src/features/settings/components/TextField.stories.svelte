<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import { ja } from '@/i18n/ja';

  import TextField from './TextField.svelte';

  const { Story } = defineMeta({
    title: '設定/components/文字列の項目',
    component: TextField,
    parameters: { layout: 'padded' },
    args: {
      key: 'fontFamily',
      label: ja.settings.fontFamily,
      description: 'description',
      value: '',
      placeholder: ja.settings.fontFamilyPlaceholder,
      onInput: () => {},
    },
  });
</script>

<script lang="ts">
  let rulers = $state('80, 100');
</script>

<Story name="既定のまま" />

<Story name="調整済み" args={{ value: 'Noto Sans JP', onReset: () => {} }} />

{#snippet live()}
  <TextField
    key="editor.rulers"
    label={ja.settings.editor.rulers.label}
    description={ja.settings.editor.rulers.description}
    placeholder={ja.settings.editor.rulers.placeholder}
    inputmode="numeric"
    value={rulers}
    onInput={(value) => (rulers = value)}
    onReset={rulers === '' ? undefined : () => (rulers = '')}
  />
{/snippet}

<Story name="打てる" template={live} parameters={{ controls: { disable: true } }} />
