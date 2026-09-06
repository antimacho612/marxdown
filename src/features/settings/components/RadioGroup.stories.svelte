<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import { ja } from '@/i18n/ja';

  import RadioGroup from './RadioGroup.svelte';
  import type { Choice } from './types';

  const THEMES: Choice[] = [
    { value: 'system', label: ja.settings.themeSystem },
    { value: 'light', label: ja.settings.themeLight },
    { value: 'dark', label: ja.settings.themeDark },
  ];

  const CLOSE_BEHAVIORS: Choice[] = [
    { value: 'tray', label: ja.settings.window.closeBehaviorTray },
    { value: 'exit', label: ja.settings.window.closeBehaviorExit },
  ];

  const { Story } = defineMeta({
    title: '設定/components/排他の選択肢',
    component: RadioGroup,
    parameters: { layout: 'padded' },
    args: {
      label: ja.settings.theme,
      description: 'description',
      value: 'system',
      options: THEMES,
      onChange: () => {},
    },
  });
</script>

<script lang="ts">
  let theme = $state('system');
</script>

<Story name="既定のまま" />

<Story name="調整済み" args={{ value: 'dark' }} />

<!-- 2 つ置いても `name` が別なので、片方を選んでももう片方は動かない。 -->
{#snippet twoGroups()}
  <div style="display: flex; flex-direction: column; gap: 12px;">
    <RadioGroup label={ja.settings.theme} description="" value="system" options={THEMES} onChange={() => {}} />
    <RadioGroup
      label={ja.settings.window.closeBehavior}
      description=""
      value="tray"
      options={CLOSE_BEHAVIORS}
      onChange={() => {}}
    />
  </div>
{/snippet}

<Story name="グループを 2 つ並べた時" template={twoGroups} parameters={{ controls: { disable: true } }} />

{#snippet live()}
  <RadioGroup
    label={ja.settings.theme}
    description=""
    options={THEMES}
    value={theme}
    onChange={(value) => (theme = value)}
  />
{/snippet}

<Story name="選べる" template={live} parameters={{ controls: { disable: true } }} />
