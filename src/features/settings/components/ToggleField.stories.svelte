<!--
  真偽値の項目。

  **ラベルが「〜する」の形になっている**ことが要点。
  「ミニマップ [✓]」だと、チェックが「表示」なのか「有効」なのか読めない。
  ラベル列を使わず 1 列に伸ばすのも同じ理由で、左に名前・右に四角では
  同じ言葉を 2 回書くことになる。
-->
<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import { ja } from '@/i18n/ja';

  import ToggleField from './ToggleField.svelte';

  const { Story } = defineMeta({
    title: '設定/components/真偽値の項目',
    component: ToggleField,
    parameters: { layout: 'padded' },
    args: {
      label: ja.settings.editor.minimap,
      checked: false,
      onChange: () => {},
    },
  });
</script>

<script lang="ts">
  let ligatures = $state(false);
</script>

<Story name="既定のまま" />

<Story name="調整済み" args={{ checked: true, onReset: () => {} }} />

<!-- 他の項目と並べたときに、ラベルの太さと行の高さが揃っていることを見る。 -->
{#snippet stacked()}
  <div style="display: flex; flex-direction: column; gap: 12px;">
    <ToggleField label={ja.settings.editor.fontLigatures} checked={true} onChange={() => {}} onReset={() => {}} />
    <ToggleField label={ja.settings.editor.guidesIndentation} checked={true} onChange={() => {}} />
    <ToggleField label={ja.settings.editor.minimap} checked={false} onChange={() => {}} />
    <ToggleField label={ja.settings.editor.scrollBeyondLastLine} checked={false} onChange={() => {}} />
  </div>
{/snippet}

<Story name="並べた時" template={stacked} parameters={{ controls: { disable: true } }} />

{#snippet live()}
  <ToggleField
    label={ja.settings.editor.fontLigatures}
    checked={ligatures}
    onChange={(checked) => (ligatures = checked)}
    onReset={ligatures ? () => (ligatures = false) : undefined}
  />
{/snippet}

<Story name="押せる" template={live} parameters={{ controls: { disable: true } }} />
