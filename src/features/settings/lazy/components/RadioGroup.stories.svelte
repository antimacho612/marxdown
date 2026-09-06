<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import { ja } from '@/i18n/ja';
  import type { Theme, WindowCloseBehavior } from '@/platform';

  import RadioGroup from './RadioGroup.svelte';

  /**
   * 選択肢は部品がスキーマから引くので、story 側で並べない。
   * どのキーを描くかで選択肢が変わるため、`args` ではなくテンプレートで渡している。
   */
  const { Story } = defineMeta({
    title: '設定/components/排他の選択肢',
    component: RadioGroup,
    parameters: { layout: 'padded', controls: { disable: true } },
  });

  const THEME_LABELS = {
    system: ja.settings.themeSystem,
    light: ja.settings.themeLight,
    dark: ja.settings.themeDark,
  } satisfies Record<Theme, string>;

  const CLOSE_BEHAVIOR_LABELS = {
    tray: ja.settings.window.closeBehaviorTray,
    exit: ja.settings.window.closeBehaviorExit,
  } satisfies Record<WindowCloseBehavior, string>;
</script>

<script lang="ts">
  let theme = $state<Theme>('system');
</script>

{#snippet themeField(value: Theme)}
  <RadioGroup
    settingKey="theme"
    label={ja.settings.theme}
    description={ja.settings.themeHint}
    labels={THEME_LABELS}
    {value}
    onChange={() => {}}
  />
{/snippet}

{#snippet asDefault()}
  {@render themeField('system')}
{/snippet}

<Story name="既定のまま" template={asDefault} />

{#snippet customized()}
  {@render themeField('dark')}
{/snippet}

<Story name="調整済み" template={customized} />

<!-- 2 つ置いても `name` が別なので、片方を選んでももう片方は動かない。 -->
{#snippet twoGroups()}
  <div style="display: flex; flex-direction: column; gap: 12px;">
    <RadioGroup
      settingKey="theme"
      label={ja.settings.theme}
      description=""
      labels={THEME_LABELS}
      value="system"
      onChange={() => {}}
    />
    <RadioGroup
      settingKey="window.closeBehavior"
      label={ja.settings.window.closeBehavior}
      description=""
      labels={CLOSE_BEHAVIOR_LABELS}
      value="tray"
      onChange={() => {}}
    />
  </div>
{/snippet}

<Story name="グループを 2 つ並べた時" template={twoGroups} />

{#snippet live()}
  <RadioGroup
    settingKey="theme"
    label={ja.settings.theme}
    description=""
    labels={THEME_LABELS}
    value={theme}
    onChange={(value) => (theme = value)}
  />
{/snippet}

<Story name="選べる" template={live} />
