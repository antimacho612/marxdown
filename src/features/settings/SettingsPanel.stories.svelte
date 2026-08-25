<!--
  設定 UI（F-CONF-05）。

  実アプリでは `Ctrl+,` を押さないと出てこない（遅延チャンク）ので、状態を並べて
  見るにはここが要る。**壊れた `settings.json` の読み取り専用状態**は、
  実アプリだと本当にファイルを壊さないと再現できない。

  ライト / ダークはツールバーのテーマ切り替えで両方見られる
  （`.storybook/preview.ts` が `data-theme` を打つ）。**周りの色を決めるのは
  常にツールバー側**で、story が積んだ `theme` の値はラジオの選択状態にしか出ない。
  実アプリでは `applyAppearance` が両方を同時に動かすが、ここでは
  「どちらのテーマでもパネルが読めるか」を見たいので、あえて分けてある。

  値の出どころは `settingsStore`、壊れているかどうかは `readSettings`（Platform 層）。
  どちらも loader で差し替えている。**コンポーネントに props で流し込む形にしない**のは、
  実アプリと同じ経路を通したいため。
-->
<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import { settingsStore } from '@/features/settings/store.svelte';
  import { DEFAULT_SETTINGS, getPlatform, setPlatform, type Platform, type Settings } from '@/platform';

  import SettingsPanel from './SettingsPanel.svelte';

  const { Story } = defineMeta({
    title: 'シェル/設定',
    component: SettingsPanel,
    parameters: { layout: 'fullscreen' },
    args: { onclose: () => {} },
  });

  const BROKEN = {
    path: 'C:\\Users\\me\\AppData\\Roaming\\com.antimacho612.marxdown\\settings.json',
    message: 'expected `,` or `}` at line 3 column 1',
  };

  function seed(values: Partial<Settings>, broken: typeof BROKEN | null = null) {
    return () => {
      settingsStore.values = { ...DEFAULT_SETTINGS, ...values };
      setPlatform({
        ...getPlatform(),
        readSettings: () => Promise.resolve({ values: settingsStore.values, broken }),
        // Storybook からファイルを書きに行かせない。押せることだけ確認できればよい。
        writeSettings: (patch) => {
          settingsStore.values = { ...settingsStore.values, ...patch } as Settings;
          return Promise.resolve(settingsStore.values);
        },
        openSettingsFile: () => Promise.resolve(),
      } as Platform);
    };
  }
</script>

<!-- 実アプリでは本文の上に浮く。背景を敷いて、その関係が分かるようにしておく。 -->
{#snippet floating(args: { onclose: () => void })}
  <div class="sb-stage">
    <SettingsPanel {...args} />
  </div>
{/snippet}

<!--
  **初期状態。ここで「既定に戻す」が 1 つも出ていないことが要点。**
  押しても何も起きないボタンを並べない（`items.ts` と同じ判断）。
-->
<Story name="既定値" loaders={[seed({})]} template={floating} />

<!-- 触った後。触った項目にだけ「既定に戻す」が生える。 -->
<Story
  name="調整済み"
  loaders={[
    seed({
      theme: 'dark',
      'preview.fontFamily': 'Noto Sans JP',
      'preview.fontSize': 18,
      'preview.lineHeight': 1.9,
      'preview.maxWidth': 80,
    }),
  ]}
  template={floating}
/>

<!--
  壊れた `settings.json`（02.architecture.md §4.5）。
  **入力欄がまとめて止まり、「settings.json を開く」だけが押せる。**
  ここで保存できてしまうと、ユーザーが直している最中のファイルを吹き飛ばす。
-->
<Story name="settings.json が壊れている" loaders={[seed({ theme: 'dark' }, BROKEN)]} template={floating} />

<style>
  .sb-stage {
    position: relative;
    height: 100vh;
    background: var(--mx-color-bg);
  }
</style>
