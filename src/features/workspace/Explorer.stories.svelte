<!--
  Explorer の空状態と、見出し行からツリーまでの積み方（F-NAV-03 / #103）。

  基点が決まるのは `marxdown <dir>` か「フォルダを開く」を通ったときだけなので、
  実アプリでこの状態を出すには起動し直すしかない。ここでは `loaders` でストアに直接入れる。
  ツリーそのものの見た目は `lazy/FileTree.stories.svelte`、絞り込みは `lazy/ExplorerBody.stories.svelte` にある。
-->
<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import { documentStore } from '@/features/document';
  import type { DocumentMeta } from '@/platform';

  import Explorer from './Explorer.svelte';
  import { treeStore } from './tree.svelte';

  const ROOT = 'C:\\Users\\me\\repos\\marxdown';

  const { Story } = defineMeta({
    title: '画面/エクスプローラー',
    component: Explorer,
  });

  const META: DocumentMeta = {
    path: 'C:\\Users\\me\\repos\\marxdown\\README.md',
    eol: 'lf',
    bom: false,
    encoding: 'utf8',
    mtimeMs: 0,
    size: 1024,
    readonly: false,
  };

  /** ストアはモジュールの singleton なので、story ごとに入れ直す（`Welcome.stories.svelte` と同じ形）。 */
  function withoutRoot(meta: DocumentMeta | null) {
    return () => {
      treeStore.root = null;
      treeStore.entries = {};
      treeStore.expanded = [];
      treeStore.loading = [];
      treeStore.focusPath = null;
      documentStore.meta = meta;
    };
  }

  /** 基点が決まっている状態。見出し行・ツールバー・ツリーの 3 段が縦に並ぶ。 */
  function withRoot() {
    return () => {
      treeStore.root = ROOT;
      treeStore.entries = {
        [ROOT]: [
          { name: 'docs', path: `${ROOT}\\docs`, dir: true },
          { name: 'README.md', path: `${ROOT}\\README.md`, dir: false },
          { name: 'package.json', path: `${ROOT}\\package.json`, dir: false },
        ],
      };
      treeStore.expanded = [];
      treeStore.loading = [];
      treeStore.focusPath = null;
      documentStore.meta = META;
    };
  }
</script>

<!-- 引数なしで起動した直後。開くフォルダを選ぶ以外にできることが無い。 -->
<Story name="フォルダも文書も無い" loaders={[withoutRoot(null)]} />

<!--
  ファイル指定で起動した直後（#103）。
  親ディレクトリは分かっているので、ダイアログを開かずに基点にできる導線を足す（VS Code には無い）。
-->
<Story name="文書だけ開いている" loaders={[withoutRoot(META)]} />

<!--
  フォルダを開いた後。ツールバーは遅延チャンク側にあり（`lazy/ExplorerBody.svelte`）、ここで初めて現れる。
  スクロールするのはツリーだけで、見出し行とツールバーは上に残る。
-->
<Story name="フォルダを開いている" loaders={[withRoot()]} />
