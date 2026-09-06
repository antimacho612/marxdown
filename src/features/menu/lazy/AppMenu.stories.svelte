<!--
  ハンバーガーメニューの中身（03.ux-spec/01-screen-layout.md §3）。

  実アプリでは押さないと出てこない（遅延チャンク）ので、状態を並べて見るには
  ここが要る。**ファイルを開いているかどうかで項目の数が変わる**のが要点で、
  押しても何も起きない項目を並べない（`items.ts` の判断）ことの確認場所でもある。

  タイトルバーからぶら下がる `position: absolute` なので、
  実際の位置関係は「シェル/タイトルバー」側では見られない。ここでは
  基準になる箱を story の中に自分で用意している。
-->
<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import { documentStore } from '@/features/document/store.svelte';
  import { recentStore } from '@/features/workspace/recent.svelte';
  import type { DocumentMeta } from '@/platform';

  import AppMenu from './AppMenu.svelte';

  const { Story } = defineMeta({
    title: 'シェル/ハンバーガーメニュー',
    component: AppMenu,
    parameters: { layout: 'fullscreen' },
    args: { onclose: () => {}, focusLast: false },
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

  const SAMPLE = [
    'C:\\Users\\me\\repos\\marxdown\\README.md',
    'C:\\Users\\me\\repos\\marxdown\\docs.local\\00.design-brief.md',
    'C:\\Users\\me\\repos\\marxdown\\docs.local\\02.architecture/README.md',
  ];

  function seed(meta: DocumentMeta | null, paths: string[]) {
    return () => {
      documentStore.meta = meta;
      recentStore.entries = paths.map((path, i) => ({ path, openedAtMs: i }));
    };
  }
</script>

<!-- 位置の基準。実アプリではタイトルバーの `.mx-menubutton` がこれにあたる。 -->
{#snippet anchored(args: { onclose: () => void; focusLast: boolean })}
  <div class="sb-anchor">
    <AppMenu {...args} />
  </div>
{/snippet}

<Story name="ファイルを開いている" loaders={[seed(BASE, SAMPLE)]} template={anchored} />

<!--
  引数なし起動の直後。**再読み込み・検索・倍率が丸ごと消える。**
  押しても何も起きない項目を並べないため（Principle 3）。
-->
<Story name="ファイル未オープン" loaders={[seed(null, SAMPLE)]} template={anchored} />

<!-- 初回起動。履歴の見出しは残し、中身を 1 行の文で埋める。 -->
<Story name="履歴なし" loaders={[seed(BASE, [])]} template={anchored} />

<!-- 深いパスが省略され、末尾（＝現在地）が残ることの確認。 -->
<Story
  name="長いパスの履歴"
  loaders={[
    seed(BASE, [
      'C:\\Users\\me\\Documents\\projects\\2026\\q3\\customer-a\\deliverables\\spec\\requirements.md',
      ...SAMPLE,
    ]),
  ]}
  template={anchored}
/>

<style>
  .sb-anchor {
    position: relative;
    height: 20rem;
    background: var(--mx-color-bg);
  }
</style>
