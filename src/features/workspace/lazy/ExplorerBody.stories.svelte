<!--
  ツールバーと絞り込み（F-NAV-03 / 03.ux-spec/06-panes.md §1）。

  実アプリでこの状態を並べるにはボタンを押して回るしかないので、ここでは `loaders` でストアへ直接入れる。
  ツールバー単体ではなく `ExplorerBody` を描画しているのは、ボタンの状態と木の中身が一致していることを 1 画面で確認するためである。
-->
<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import type { DirEntry } from '@/platform';

  import { treeStore } from '../tree.svelte';
  import ExplorerBody from './ExplorerBody.svelte';
  import { filterStore, resetFilter } from './filter.svelte';

  const { Story } = defineMeta({
    title: '画面/エクスプローラーのフィルター',
    component: ExplorerBody,
  });

  const ROOT = 'C:/work/marxdown';

  const ENTRIES: DirEntry[] = [
    { name: 'docs', path: `${ROOT}/docs`, dir: true },
    { name: 'src', path: `${ROOT}/src`, dir: true },
    { name: 'README.md', path: `${ROOT}/README.md`, dir: false },
    { name: 'CHANGELOG.markdown', path: `${ROOT}/CHANGELOG.markdown`, dir: false },
    { name: 'package.json', path: `${ROOT}/package.json`, dir: false },
    { name: 'logo.png', path: `${ROOT}/logo.png`, dir: false },
    { name: 'vite.config.ts', path: `${ROOT}/vite.config.ts`, dir: false },
  ];

  /** ストアはモジュールの singleton なので、story ごとに入れ直す（`FileTree.stories.svelte` と同じ形）。 */
  function withFilter(filter: { markdownOnly?: boolean; input?: string; open?: boolean; entries?: DirEntry[] }) {
    return () => {
      treeStore.root = ROOT;
      treeStore.entries = { [ROOT]: filter.entries ?? ENTRIES };
      treeStore.expanded = [];
      treeStore.loading = [];
      // Tab の順路に置く項目も初期化する（`FileTree.stories.svelte` と同じ理由）。
      treeStore.focusPath = null;

      resetFilter();
      filterStore.markdownOnly = filter.markdownOnly ?? false;
      filterStore.extensionsInput = filter.input ?? '';
      filterStore.extensionsOpen = filter.open ?? false;
    };
  }
</script>

<!-- 絞り込んでいない状態。Markdown 以外も並び、淡い色で区別される。 -->
<Story name="既定" loaders={[withFilter({})]} />

<!-- Markdown だけ。ディレクトリは対象外なので残る（閉じた枝の中身は開くまで分からない）。 -->
<Story name="Markdown だけ" loaders={[withFilter({ markdownOnly: true })]} />

<!-- 拡張子の入力欄を開いた状態。入力欄はツールバーの下に出て、木を押し下げる。 -->
<Story name="拡張子フィルター" loaders={[withFilter({ input: 'json, png', open: true })]} />

<!--
  両方を押した状態。拡張子フィルターが優先され、Markdown ボタンは `aria-disabled` になる。
  押した記録（`aria-pressed`）は残すので、拡張子を消せば元の絞り込みに戻る。
-->
<Story name="拡張子フィルターが優先" loaders={[withFilter({ markdownOnly: true, input: 'ts', open: true })]} />

<!--
  一致が 0 件。空のフォルダとは別の文言を出す。
  ディレクトリは絞り込みの対象外なので、この状態になるのは中身がファイルだけのフォルダに限られる。
-->
<Story
  name="一致なし"
  loaders={[withFilter({ input: 'rs', open: true, entries: ENTRIES.filter((entry) => !entry.dir) })]}
/>
