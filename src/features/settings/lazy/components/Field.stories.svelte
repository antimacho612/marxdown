<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import Field from './Field.svelte';

  const { Story } = defineMeta({
    title: '設定/components/項目の器',
    component: Field,
    parameters: { layout: 'padded' },
  });
</script>

{#snippet one()}
  <Field labelFor="mx-story-field-1" label="文字サイズ" description="項目の説明" tooltip="ツールチップ">
    <input id="mx-story-field-1" type="number" value="16" />
  </Field>
{/snippet}

<Story name="補足なし" template={one} />

{#snippet withHint()}
  <Field labelFor="mx-story-field-2" label="本文幅" description="項目の説明" tooltip="ツールチップ">
    <input id="mx-story-field-2" type="number" value="72" />
    <span>ch</span>
  </Field>
{/snippet}

<Story name="補足あり" template={withHint} />

<!-- 並べたときに、補足の有無でラベルの高さがずれないことを見る。 -->
{#snippet stacked()}
  <div style="display: flex; flex-direction: column; gap: 12px;">
    <Field labelFor="mx-story-field-3" label="配色" description="項目の説明" tooltip="ツールチップ">
      <select id="mx-story-field-3"><option>Marxdown（既定）</option></select>
    </Field>
    <Field labelFor="mx-story-field-4" label="文字サイズ" description="項目の説明" tooltip="ツールチップ">
      <input id="mx-story-field-4" type="number" value="16" />
    </Field>
    <Field labelFor="mx-story-field-5" label="本文幅" description="項目の説明" tooltip="ツールチップ">
      <input id="mx-story-field-5" type="number" value="72" />
    </Field>
  </div>
{/snippet}

<Story name="並べた時" template={stacked} />
