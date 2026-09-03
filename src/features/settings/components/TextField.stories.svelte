<!--
  文字列の項目（フォント名・縦罫線）。

  **「既定に戻す」は `onReset` を渡した時だけ出る。** 既定のままの項目に
  押しても何も起きないボタンを並べないための仕組みが、この 2 つの story の差になっている。
-->
<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import { ja } from '@/i18n/ja';

  import TextField from './TextField.svelte';

  const { Story } = defineMeta({
    title: '設定/components/文字列の項目',
    component: TextField,
    parameters: { layout: 'padded' },
    args: {
      label: ja.settings.fontFamily,
      value: '',
      hint: ja.settings.fontFamilyHint,
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

<Story name="補足なし" args={{ hint: '' }} />

<!--
  縦罫線。**打っている途中の文字列をそのまま持つ**（`80,` でカンマが消えない）。
  実アプリでこの state を持っているのは `SettingsDialog` の側。
-->
{#snippet live()}
  <TextField
    label={ja.settings.editor.rulers}
    hint={ja.settings.editor.rulersHint}
    placeholder={ja.settings.editor.rulersPlaceholder}
    inputmode="numeric"
    value={rulers}
    onInput={(value) => (rulers = value)}
    onReset={rulers === '' ? undefined : () => (rulers = '')}
  />
{/snippet}

<Story name="打てる" template={live} parameters={{ controls: { disable: true } }} />
