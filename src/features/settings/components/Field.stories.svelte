<!--
  項目の器。**中身を持たない**ので、ここでは素の入力欄を置いて枠だけを見る。

  見たいのは 2 列の比率（ラベル 10rem / 操作列は残り全部）と、
  補足が付いたときにラベルが上端に揃ったままかどうか。
-->
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
  <Field labelFor="mx-story-field-1" label="文字サイズ">
    <input id="mx-story-field-1" type="number" value="16" />
  </Field>
{/snippet}

<Story name="補足なし" template={one} />

{#snippet withHint()}
  <Field labelFor="mx-story-field-2" label="本文幅" hint="1 行に収まる半角文字の数">
    <input id="mx-story-field-2" type="number" value="72" />
    <span>ch</span>
  </Field>
{/snippet}

<Story name="補足あり" template={withHint} />

<!-- 並べたときに、補足の有無でラベルの高さがずれないことを見る。 -->
{#snippet stacked()}
  <div style="display: flex; flex-direction: column; gap: 12px;">
    <Field labelFor="mx-story-field-3" label="配色" hint="ライト / ダークは上の「テーマ」に従う">
      <select id="mx-story-field-3"><option>Marxdown（既定）</option></select>
    </Field>
    <Field labelFor="mx-story-field-4" label="文字サイズ">
      <input id="mx-story-field-4" type="number" value="16" />
    </Field>
    <Field labelFor="mx-story-field-5" label="本文幅" hint="1 行に収まる半角文字の数">
      <input id="mx-story-field-5" type="number" value="72" />
    </Field>
  </div>
{/snippet}

<Story name="並べた時" template={stacked} />
