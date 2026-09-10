<!--
  Explorer の空状態（F-NAV-03 / #103）。

  基点が決まるのは `marxdown <dir>` か「フォルダを開く」を通ったときだけなので、
  実アプリでこの状態を出すには起動し直すしかない。ここでは `loaders` でストアに直接入れる。
  基点が決まった後の見た目は `lazy/FileTree.stories.svelte` にある。
-->
<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import { documentStore } from '@/features/document';
  import type { DocumentMeta } from '@/platform';

  import Explorer from './Explorer.svelte';
  import { treeStore } from './tree.svelte';

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
      documentStore.meta = meta;
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
