<!--
  ステータスバー。

  出る項目はドキュメントのメタ情報で変わる。BOM 付き・CRLF・読み取り専用は実ファイルを用意しないと見られないので、ここに並べておく。

  フルパスの省略のされ方もここでしか見られない。
  深いところに置いたファイルを実際に用意しなくても、ディレクトリ側だけが省略記号になり、ファイル名と右端の倍率が残ることを確かめられる。
-->
<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import { documentStore, type StoredMeta } from '@/features/document';
  import { viewStore } from '@/features/view';
  import type { ViewMode } from '@/platform';

  import StatusBar from './StatusBar.svelte';

  const { Story } = defineMeta({
    title: 'シェル/ステータスバー',
    component: StatusBar,
    parameters: { layout: 'fullscreen' },
  });

  const BASE: StoredMeta = {
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
  function seed(meta: StoredMeta | null, zoom = 1, mode: ViewMode = 'preview', message: string | null = null) {
    return () => {
      documentStore.meta = meta;
      documentStore.statusMessage = message;
      documentStore.textStats = meta ? { chars: 12_345, words: 2100, readingMinutes: 4 } : null;
      viewStore.zoom = zoom;
      viewStore.mode = mode;
      // Preview では出ない。
      // ストアは story をまたいで残るので、出さない story でも必ず入れ直す。
      documentStore.cursor = mode === 'preview' ? null : { line: 42, column: 8 };
    };
  }
</script>

<Story name="通常" loaders={[seed(BASE)]} />

<!-- Windows で書かれたファイル。EOL と BOM が増える。 -->
<Story name="CRLF + BOM" loaders={[seed({ ...BASE, eol: 'crlf', bom: true })]} />

<Story name="読み取り専用" loaders={[seed({ ...BASE, readonly: true })]} />

<!--
  Edit モード。カーソル位置はここで初めて出る（Preview では概念が無い）。
-->
<Story name="Edit (カーソル位置)" loaders={[seed(BASE, 1, 'edit')]} />

<!-- 倍率は 100% でも出す（押せる場所を動かさないため）。 -->
<Story name="拡大中" loaders={[seed(BASE, 1.5)]} />

<!-- 何も開いていないとき。左側が丸ごと消え、倍率も出ない。 -->
<Story name="ファイル未オープン" loaders={[seed(null)]} />

<!--
  一時メッセージ。左の項目を押し出さず、右端の倍率も残ることを確かめるのがこの story の目的である。
  ストア側のタイマーで 3 秒後に消えるため、見るには story を開き直す。
-->
<Story name="一時メッセージ" loaders={[seed(BASE, 1, 'preview', '外部の変更を読み込みました')]} />

<!--
  深いパス。ディレクトリ側だけが省略記号になり、ファイル名は残る。
  右端の倍率が画面外へ押し出されないことも、ここで見る。
-->
<Story
  name="深いパス"
  loaders={[
    seed({
      ...BASE,
      path: 'C:\\Users\\me\\Documents\\projects\\2026\\q3\\customer-a\\deliverables\\spec\\requirements-and-acceptance-criteria.md',
    }),
  ]}
/>

<!-- 無題の文書（`Ctrl+N`）。パスが無いので、フルパスの項目ごと出ない。 -->
<Story name="無題" loaders={[seed({ ...BASE, path: null })]} />
