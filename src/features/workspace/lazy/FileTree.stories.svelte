<!--
  ファイルツリー（F-NAV-03 / 03.ux-spec/06-panes.md §1）。

  実アプリで木を並べるにはディレクトリを開いて回るしかないので、ここでは `loaders` でストアへ直接入れる。
  `dev:web` の仮想 FS にはディレクトリが無く（`platform/web.ts` の `listDir`）、見た目を確かめられるのはここだけである。
-->
<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import type { DirEntry } from '@/platform';

  import { treeStore } from '../tree.svelte';
  import FileTree from './FileTree.svelte';
  import { resetFilter } from './filter.svelte';
  import { resetSelection, selection, type Editing } from './selection.svelte';

  const { Story } = defineMeta({
    title: '画面/ファイルツリー',
    component: FileTree,
  });

  function file(dir: string, name: string): DirEntry {
    return { name, path: `${dir}/${name}`, dir: false };
  }

  function folder(dir: string, name: string): DirEntry {
    return { name, path: `${dir}/${name}`, dir: true };
  }

  const ROOT = 'C:/work/marxdown';

  /** ストアはモジュールの singleton なので、story ごとに入れ直す（`Welcome.stories.svelte` と同じ形）。 */
  function withTree(entries: Record<string, DirEntry[]>, expanded: string[] = []) {
    return () => {
      treeStore.root = ROOT;
      treeStore.entries = entries;
      treeStore.expanded = expanded;
      treeStore.loading = [];
      // Tab の順路に置く項目も初期化する。残すと、前の story で操作した項目が次の story の Tab の移動先になる。
      treeStore.focusPath = null;
      // 絞り込みも singleton なので、ツールバー側の story から持ち越さない。
      resetFilter();
      resetSelection();
    };
  }

  /**
   * ファイル操作の途中の表示（03.ux-spec/06-panes.md §1.4）。
   * 実アプリでは複数の操作を重ねないと並ばないため、選択・切り取り・ドロップ先を直接入れる。
   */
  function withOperation(state: { selected?: string[]; cut?: string[]; drop?: string; editing?: Editing }) {
    return () => {
      withTree(NESTED, [`${ROOT}/docs`])();
      selection.selected = state.selected ?? [];
      selection.clipboard = state.cut ? { paths: state.cut, mode: 'cut' } : null;
      selection.dropTarget = state.drop ?? null;
      selection.editing = state.editing ?? null;
    };
  }

  const FLAT = {
    [ROOT]: [
      folder(ROOT, 'docs'),
      folder(ROOT, 'src'),
      file(ROOT, 'README.md'),
      file(ROOT, 'package.json'),
      file(ROOT, 'vite.config.ts'),
    ],
  };

  const NESTED = {
    ...FLAT,
    [`${ROOT}/docs`]: [
      folder(`${ROOT}/docs`, '02.architecture'),
      file(`${ROOT}/docs`, 'README.md'),
      file(`${ROOT}/docs`, '00.design-brief.md'),
    ],
  };
</script>

<!-- Markdown は通常の色、それ以外は淡く（Markdown First）。 -->
<!-- 名前が数字で始まると Storybook の索引が作れない（識別子にならない）。`exportName` を明示する。 -->
<Story name="1 階層" exportName="OneLevel" loaders={[withTree(FLAT)]} />

<!-- 開いた枝だけを描く。閉じた枝は中身ごと存在しない。 -->
<Story name="展開" loaders={[withTree(NESTED, [`${ROOT}/docs`])]} />

<!-- 空のディレクトリ。操作できない行を並べる代わりに 1 行の説明を出す。 -->
<Story name="空" loaders={[withTree({ [ROOT]: [] })]} />

<!-- 複数選択・切り取り中（淡い表示）・ドラッグで落とす先の 3 つを同時に並べる。 -->
<Story
  name="選択と切り取り"
  loaders={[
    withOperation({
      selected: [`${ROOT}/README.md`, `${ROOT}/package.json`],
      cut: [`${ROOT}/docs/00.design-brief.md`],
      drop: `${ROOT}/src`,
    }),
  ]}
/>

<!-- 行内の入力欄。同じ階層にある名前を打つと、確定できない理由が下に出る。 -->
<Story name="リネーム中" loaders={[withOperation({ editing: { kind: 'rename', path: `${ROOT}/docs/README.md` } })]} />

<Story
  name="新規作成中"
  loaders={[withOperation({ editing: { kind: 'create', parent: `${ROOT}/docs`, dir: false } })]}
/>
