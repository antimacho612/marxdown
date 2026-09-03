<!--
  排他の選択肢（テーマ / 閉じるときの動作）。

  **素のラジオボタンにしてある。** 矢印キーでの移動も `Tab` の扱い
  （グループ全体で 1 つ）もブラウザ側が実装しているので、ここで確かめられる。
  2 つ並べた story は、`name` が実体ごとに振られていて**混ざらない**ことを見るためのもの。
-->
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

<Story name="調整済み" args={{ value: 'dark', onReset: () => {} }} />

<!-- 2 つ置いても `name` が別なので、片方を選んでももう片方は動かない。 -->
{#snippet twoGroups()}
  <div style="display: flex; flex-direction: column; gap: 12px;">
    <RadioGroup label={ja.settings.theme} value="system" options={THEMES} onChange={() => {}} />
    <RadioGroup label={ja.settings.window.closeBehavior} value="tray" options={CLOSE_BEHAVIORS} onChange={() => {}} />
  </div>
{/snippet}

<Story name="グループを 2 つ並べた時" template={twoGroups} parameters={{ controls: { disable: true } }} />

{#snippet live()}
  <RadioGroup
    label={ja.settings.theme}
    options={THEMES}
    value={theme}
    onChange={(value) => (theme = value)}
    onReset={theme === 'system' ? undefined : () => (theme = 'system')}
  />
{/snippet}

<Story name="選べる" template={live} parameters={{ controls: { disable: true } }} />
