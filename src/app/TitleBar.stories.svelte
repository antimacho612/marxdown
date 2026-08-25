<!--
  カスタムタイトルバー（03.ux-spec.md §2.1 / OQ-02 = B）。

  Tauri を起動せずにクロームの状態を並べるための場所（04.tech-stack.md §7.2）。
  ここでしか確認できないものが 3 つある。

  - **最大化中の絵柄**（`□` / `❐`）。実アプリでは実際に最大化しないと見られない
  - **長いパスの潰れ方**。ウィンドウ操作ボタンを画面外へ押し出さないこと
  - **M3 でタブを差し込んだときの姿**（§2.2）。まだタブは実装していない

  ウィンドウ操作ボタンは押せるが、ブラウザには効き目が無い（Platform の web 実装が
  何もしない）。ここで見たいのは押し心地ではなく、寸法とホバーの色。
-->
<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import { documentStore } from '@/features/document/store.svelte';
  import { viewStore } from '@/features/view/store.svelte';
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

<!-- 引数なし起動。ファイル名の代わりにアプリ名が出る。 -->
<Story name="ファイル未オープン" loaders={[seed(null)]} />

<Story name="通常" loaders={[seed(BASE)]} />

<!-- 最大化中は「元のサイズに戻す」。絵も読み上げ名も入れ替わる。 -->
<Story name="最大化中" loaders={[seed(BASE, true)]} />

<!--
  深いパスが省略記号で潰れ、**ウィンドウ操作ボタンが押し出されない**ことの確認。
  `.mx-titlebar__center` の `min-width: 0` が効いていないと、ここで破綻する。
-->
<Story
  name="長いパス"
  loaders={[
    seed({
      ...BASE,
      path: 'C:\\Users\\me\\Documents\\projects\\2026\\q3\\customer-a\\deliverables\\spec\\requirements-and-acceptance-criteria.md',
    }),
  ]}
/>

<!--
  **M3 の予行。** タブが 2 枚以上になったら、中央領域はタブストリップになる（§2.2）。
  ここで渡しているのは見た目だけの偽物で、差し込み口（`center`）が
  タイトルバーを作り直さずに使えることの確認が目的。
-->
<Story name="タブを差し込んだところ (M3)" loaders={[seed(BASE)]} asChild>
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
  /* story 専用の見せかけ。M3 の実装はこれを参考にしない。 */
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
