<!--
  タブストリップ（F-NAV-01, 02 / 03.ux-spec/01-screen-layout.md §2）。

  実アプリで枚数を揃えるにはファイルを開いて回るしかないので、ここでは `loaders` でストアへ直接入れる。
  1 枚のときの見た目はここに無い。差し込む側が `center` を渡さず、タイトルバーが既定の
  ファイル名表示のままになるためである（`app/App.svelte`）。
-->
<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import { tabsStore, type Tab } from './tabs.svelte';
  import TabStrip from './TabStrip.svelte';

  const { Story } = defineMeta({
    title: '画面/タブ',
    component: TabStrip,
  });

  function tab(id: number, path: string | null, dirty = false): Tab {
    return {
      id,
      meta: { path, eol: 'lf', bom: false, encoding: 'utf8', mtimeMs: 0, size: 0, readonly: false },
      text: null,
      scrollTop: 0,
      textDirty: dirty,
      eolOverride: null,
    };
  }

  /** ストアはモジュールの singleton なので、story ごとに入れ直す（`Welcome.stories.svelte` と同じ形）。 */
  function withTabs(tabs: Tab[], activeId: number) {
    return () => {
      tabsStore.tabs = tabs;
      tabsStore.activeId = activeId;
    };
  }

  const DIR = 'C:\\Users\\me\\repos\\marxdown';
</script>

<!-- 名前が数字で始まると Storybook の索引が作れない（識別子にならない）。`exportName` を明示する。 -->
<Story
  name="2 枚"
  exportName="TwoTabs"
  loaders={[withTabs([tab(1, `${DIR}\\README.md`), tab(2, `${DIR}\\docs\\design.md`)], 1)]}
/>

<!-- 未保存の印（`●`）は表示中のタブとそれ以外で判定元が違う（`isTabDirty`）。 -->
<Story
  name="未保存あり"
  loaders={[withTabs([tab(1, `${DIR}\\README.md`), tab(2, `${DIR}\\notes.md`, true), tab(3, null)], 1)]}
/>

<!-- 枚数が増えたら横へスクロールする。幅は等分しない。 -->
<Story
  name="多い"
  loaders={[
    withTabs(
      Array.from({ length: 12 }, (_, i) => tab(i + 1, `${DIR}\\docs\\0${i}-very-long-document-name.md`)),
      3,
    ),
  ]}
/>
