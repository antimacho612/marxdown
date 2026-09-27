<!--
  カスタムタイトルバー。

  Tauri を起動せずにクロームの状態を並べるための場所。
  ここでしか確認できないものが 2 つある。

  - 最大化中のアイコン（`□` / `❐`）。実アプリでは実際に最大化しないと見られない
  - 中央領域を差し込んだときの姿。実アプリではタブストリップが常に入るため、アプリ名だけの姿と並べて見られない

  ウィンドウ操作ボタンは押せるが、ブラウザでは何も起きない（Platform の web 実装が何もしない）。
  ここで見たいのは押したときの挙動ではなく、寸法とホバーの色。
-->
<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import { documentStore } from '@/features/document';
  import { viewStore } from '@/features/view';
  import type { DocumentMeta } from '@/platform';

  import TitleBar from './TitleBar.svelte';

  const { Story } = defineMeta({
    title: 'シェル/タイトルバー',
    component: TitleBar,
    parameters: { layout: 'fullscreen' },
  });

  const BASE: DocumentMeta = {
    path: 'C:\\Users\\me\\repos\\marxdown\\README.md',
    eol: 'lf',
    bom: false,
    encoding: 'utf8',
    mtimeMs: 0,
    size: 12_288,
    readonly: false,
  };

  /** ストアはモジュールの singleton なので、story ごとに入れ直す（StatusBar と同じ）。 */
  function seed(meta: DocumentMeta | null, maximized = false) {
    return () => {
      documentStore.meta = meta;
      viewStore.maximized = maximized;
    };
  }
</script>

<!--
  何も開いていないとき（`center` を渡さない唯一の場面）。アプリ名だけが出る。
  1 枚でも開いていれば中央領域はタブストリップになる（`app/App.svelte`）。
-->
<Story name="ファイル未オープン" loaders={[seed(null)]} />

<!-- 最大化中は「元のサイズに戻す」。アイコンも読み上げ名も入れ替わる。 -->
<Story name="最大化中" loaders={[seed(null, true)]} />

<!--
  中央領域を差し込んだところ。ここで渡しているのは見た目だけの偽物で、差し込み口（`center`）がタイトルバーを作り直さずに使えることの確認が目的である。
  本物のタブストリップの見た目は `ワークスペース/タブストリップ` にある。
-->
<Story name="タブを差し込んだところ" loaders={[seed(BASE)]} asChild>
  <TitleBar center={fakeTabs} />
</Story>

{#snippet fakeTabs()}
  <div class="sb-tabs">
    <span class="sb-tab sb-tab--active">README.md</span>
    <span class="sb-tab">design.md</span>
    <span class="sb-tab">notes.md ●</span>
  </div>
{/snippet}

<style>
  /* story 専用の見せかけ。本物は `features/workspace/TabStrip.svelte`。 */
  .sb-tabs {
    display: flex;
    align-items: stretch;
    min-width: 0;
    height: 100%;
  }

  .sb-tab {
    display: flex;
    align-items: center;
    padding-inline: var(--mx-space-3);
    border-inline-end: 1px solid var(--mx-color-border-subtle);
    color: var(--mx-color-fg-subtle);
    white-space: nowrap;
  }

  .sb-tab--active {
    background: var(--mx-color-bg);
    color: var(--mx-color-fg);
  }
</style>
