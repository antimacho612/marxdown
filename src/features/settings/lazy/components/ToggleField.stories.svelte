<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import { ja } from '@/i18n/ja';

  import ToggleField from './ToggleField.svelte';

  const { Story } = defineMeta({
    title: '設定/components/真偽値の項目',
    component: ToggleField,
    parameters: { layout: 'padded' },
    args: {
      settingKey: 'editor.minimap.enabled',
      label: ja.settings.editor.minimap.label,
      description: ja.settings.editor.minimap.description,
      checked: false,
      onChange: () => {},
    },
  });
</script>

<script lang="ts">
  let ligatures = $state(false);
</script>

<Story name="既定のまま" />

<Story name="調整済み" args={{ checked: true }} />

<!-- 他の項目と並べたときに、ラベルの太さと行の高さが揃っていることを見る。 -->
{#snippet stacked()}
  <div style="display: flex; flex-direction: column; gap: 12px;">
    <ToggleField
      settingKey="editor.fontLigatures"
      label={ja.settings.editor.fontLigatures.label}
      description={ja.settings.editor.fontLigatures.description}
      checked={true}
      onChange={() => {}}
    />
    <ToggleField
      settingKey="editor.guides.indentation"
      label={ja.settings.editor.guidesIndentation.label}
      description={ja.settings.editor.guidesIndentation.description}
      checked={true}
      onChange={() => {}}
    />
    <ToggleField
      settingKey="editor.minimap.enabled"
      label={ja.settings.editor.minimap.label}
      description={ja.settings.editor.minimap.description}
      checked={false}
      onChange={() => {}}
    />
    <ToggleField
      settingKey="editor.scrollBeyondLastLine"
      label={ja.settings.editor.scrollBeyondLastLine.label}
      description={ja.settings.editor.scrollBeyondLastLine.description}
      checked={false}
      onChange={() => {}}
    />
  </div>
{/snippet}

<Story name="並べた時" template={stacked} parameters={{ controls: { disable: true } }} />

{#snippet live()}
  <ToggleField
    settingKey="editor.fontLigatures"
    label={ja.settings.editor.fontLigatures.label}
    description={ja.settings.editor.fontLigatures.description}
    checked={ligatures}
    onChange={(checked) => (ligatures = checked)}
  />
{/snippet}

<Story name="押せる" template={live} parameters={{ controls: { disable: true } }} />
