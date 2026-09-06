<!--
  ライトペイン（03.ux-spec/06-panes.md §3）。

  実アプリと同じ grid（`shell.css` の `grid-template-areas`）の中に置いて、
  **本文とペインの取り合い**を見るための story。ここで確認できるのは 3 つ。

  - 既定幅 240px でも本文が主役のままか（Principle 2）
  - 最小幅 180px / 最大幅まで広げたときの見え方
  - 掴む場所（左端 5px）が本文のクリックを奪っていないか

  ドラッグは実際に効く。離した時点で `setPanes`（Storybook では何もしない実装）が呼ばれる。
-->
<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import TitleBar from '@/app/TitleBar.svelte';
  import { documentStore } from '@/features/document/store.svelte';
  import { Outline } from '@/features/outline';
  import { viewStore } from '@/features/view/store.svelte';
  import type { OutlineItem } from '@/markdown/plugins/line-map';
  import type { DocumentMeta } from '@/platform';

  import { PANE_WIDTH_MAX, PANE_WIDTH_MIN } from './panes';
  import RightPane from './RightPane.svelte';

  const { Story } = defineMeta({
    title: 'ペイン/ライトペイン',
    parameters: { layout: 'fullscreen' },
  });

  const META: DocumentMeta = {
    path: 'C:\\Users\\me\\repos\\marxdown\\docs\\02.architecture/README.md',
    eol: 'lf',
    bom: false,
    encoding: 'utf8',
    mtimeMs: 0,
    size: 4096,
    readonly: false,
  };

  const OUTLINE: OutlineItem[] = [
    { level: 1, text: 'アーキテクチャ', line: 0, slug: 'a' },
    { level: 2, text: 'レイヤー構成', line: 8, slug: 'b' },
    { level: 2, text: '起動シーケンス', line: 20, slug: 'c' },
    { level: 3, text: 'コールド起動', line: 24, slug: 'd' },
    { level: 3, text: 'ウォーム起動', line: 60, slug: 'e' },
  ];

  function seed(width: number) {
    return () => {
      documentStore.meta = META;
      documentStore.outline = OUTLINE;
      viewStore.panes = { left: { open: false, width: 240 }, right: { open: true, width } };
    };
  }
</script>

{#snippet stage()}
  <div class="sb-shell">
    <TitleBar />
    <div id="mx-preview" class="mx-preview">
      <div class="mx-content">
        <h1>アーキテクチャ</h1>
        <p>ペインを開いても、画面の主役は本文のままであること。</p>
        <h2>レイヤー構成</h2>
        <p>掴む場所はペインの内側にある。本文の右端をクリックしても掴まれない。</p>
        <h2>起動シーケンス</h2>
        <p>アウトラインの項目を押すと、この本文の見出しへ飛ぶ。</p>
        <h3>コールド起動</h3>
        <p>現在位置のハイライトは本文のスクロールに追従する。</p>
        <h3>ウォーム起動</h3>
        <p>ここまで来ると、アウトラインの現在位置も下がっている。</p>
      </div>
    </div>
    <RightPane>
      <Outline />
    </RightPane>
  </div>
{/snippet}

<!-- 既定幅（240px / 03.ux-spec/06-panes.md §3）。 -->
<Story name="既定幅" loaders={[seed(240)]} template={stage} />

<!-- 最小幅。長い見出しがどこで省略されるかを見る。 -->
<Story name="最小幅 (180px)" loaders={[seed(PANE_WIDTH_MIN)]} template={stage} />

<!-- 上限まで広げた状態。本文が潰れないための歯止め（`store.rs` と同じ値）。 -->
<Story name="最大幅" loaders={[seed(PANE_WIDTH_MAX)]} template={stage} />

<style>
  /*
   * 実アプリの body grid（`shell.css`）の代わり。
   * **列の名前は同じ**にしてある。ここが実装とずれると、story だけ壊れる。
   */
  .sb-shell {
    display: grid;
    grid-template-columns: auto 1fr auto;
    grid-template-rows: var(--mx-titlebar-height) 1fr;
    grid-template-areas:
      'titlebar titlebar titlebar'
      'leftpane main rightpane';
    height: 100vh;
    background: var(--mx-color-bg);
  }
</style>
