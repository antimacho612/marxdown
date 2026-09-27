<!--
  ハンバーガーメニューの中身。

  実アプリでは押さないと表示されない（遅延チャンク）ため、状態を並べて確認するにはここが必要である。
  ファイルを開いているかどうかで項目の数が変わるのが要点で、押しても何も起きない項目を並べない（`items.ts` の判断）ことの確認場所でもある。

  タイトルバーの下に表示する `position: absolute` の要素であるため、実際の位置関係は「シェル/タイトルバー」側では確認できない。
  ここでは基準になる箱を story の中に自分で用意している。
-->
<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import { documentStore } from '@/features/document';
  import { recentStore } from '@/features/workspace';
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
  引数なし起動の直後。再読み込み・検索・倍率が丸ごと消える。
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
