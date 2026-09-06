<!--
  本文（プレビュー）の見本。

  **配色は見本自身に乗る**（`data-mx-theme` / ADR-0013）ので、周りは
  クロームの配色のまま変わらない。実アプリでも同じで、面の外まで色は及ばない。

  **文字のほうはトークン層（`:root`）から着る**ので、ここでは既定のままになる。
  実アプリで文字サイズや行間を動かしているのは `applyAppearance`。
  ライト / ダークはツールバーで切り替えられる。
-->
<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import ContentSample from './ContentSample.svelte';

  const { Story } = defineMeta({
    title: '設定/components/本文の見本',
    component: ContentSample,
    parameters: { layout: 'padded' },
    args: { palette: 'default' },
  });
</script>

<Story name="既定" args={{ palette: 'default' }} />
<Story name="GitHub" args={{ palette: 'github' }} />
<Story name="Solarized" args={{ palette: 'solarized' }} />
<Story name="Nord" args={{ palette: 'nord' }} />
<Story name="Gruvbox" args={{ palette: 'gruvbox' }} />

<!-- 5 つ並べて、どれを選ぶと何が変わるかを 1 画面で比べる。 -->
{#snippet all()}
  <div style="display: flex; flex-direction: column; gap: 12px;">
    <ContentSample palette="default" />
    <ContentSample palette="github" />
    <ContentSample palette="solarized" />
    <ContentSample palette="nord" />
    <ContentSample palette="gruvbox" />
  </div>
{/snippet}

<Story name="並べた時" template={all} parameters={{ controls: { disable: true } }} />
