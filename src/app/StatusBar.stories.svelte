<!--
  ステータスバー（03.ux-spec/07-status-and-notifications.md §3）。

  出る項目はドキュメントのメタ情報で変わる。BOM 付き・CRLF・読み取り専用は
  実ファイルを用意しないと見られないので、ここに並べておく。
-->
<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import { documentStore } from '@/features/document/store.svelte';
  import { viewStore } from '@/features/view/store.svelte';
  import type { DocumentMeta } from '@/platform';

  import StatusBar from './StatusBar.svelte';

  const { Story } = defineMeta({
    title: 'シェル/ステータスバー',
    component: StatusBar,
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

  /**
   * ストアはモジュールの singleton なので、story ごとに入れ直す。
   * `loaders` を使う理由は Welcome.stories.svelte と同じ。
   */
  function seed(meta: DocumentMeta | null, zoom = 1) {
    return () => {
      documentStore.meta = meta;
      documentStore.textStats = meta ? { chars: 12_345, words: 2100, readingMinutes: 4 } : null;
      viewStore.zoom = zoom;
    };
  }
</script>

<Story name="通常" loaders={[seed(BASE)]} />

<!-- Windows で書かれたファイル。EOL と BOM が増える。 -->
<Story name="CRLF + BOM" loaders={[seed({ ...BASE, eol: 'crlf', bom: true })]} />

<Story name="読み取り専用" loaders={[seed({ ...BASE, readonly: true })]} />

<!-- 倍率は 100% でも出す（押せる場所を動かさないため / 03.ux-spec/07-status-and-notifications.md §3）。 -->
<Story name="拡大中" loaders={[seed(BASE, 1.5)]} />

<!-- 何も開いていないとき。左側が丸ごと消え、倍率も出ない。 -->
<Story name="ファイル未オープン" loaders={[seed(null)]} />
