<!--
  アウトライン（F-VIEW-02 / 03.ux-spec/06-panes.md §2）。

  中身の状態は**開いているファイルで決まる**ので、実アプリで並べて見ることができない。
  ここに並べておくと、見出しが無い / 少ない / 深い / 長大の 4 つを 1 画面で比べられる。

  現在位置の自動ハイライト（`IntersectionObserver`）は本文が要るので、ここでは動かない。
  それは `follow.dom.test.ts` の担当で、ここで見たいのは**並びと詰まり方**。
-->
<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import { documentStore } from '@/features/document/store.svelte';
  import type { OutlineItem } from '@/markdown/plugins/line-map';
  import type { DocumentMeta } from '@/platform';

  import Outline from './Outline.svelte';

  const { Story } = defineMeta({
    title: 'ペイン/アウトライン',
    component: Outline,
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

  function item(level: number, text: string, line: number): OutlineItem {
    return { level, text, line, slug: `h-${line}` };
  }

  const FEW: OutlineItem[] = [item(1, 'メモ', 0), item(2, '今日やること', 4)];

  const TYPICAL: OutlineItem[] = [
    item(1, 'アーキテクチャ', 0),
    item(2, 'レイヤー構成', 8),
    item(2, '起動シーケンス', 20),
    item(3, 'コールド起動', 24),
    item(3, 'ウォーム起動', 60),
    item(2, 'レンダリングパイプライン', 90),
  ];

  /** 深い階層。H1 から H6 まで下りて戻る。インデントが潰れないかを見る。 */
  const DEEP: OutlineItem[] = [
    item(1, '設計', 0),
    item(2, '前提', 4),
    item(3, '対象環境', 8),
    item(4, 'Windows 11', 12),
    item(5, 'WebView2 Evergreen', 16),
    item(6, '既知の制約（かなり長い見出しで、折り返さずに省略されることを見る）', 20),
    item(2, '結論', 30),
  ];

  /** H2 から始まる文書。**一番浅い見出しが左端に来る**（全部が 1 段下がらない）。 */
  const STARTS_AT_H2: OutlineItem[] = [item(2, '概要', 0), item(3, '背景', 6), item(2, '手順', 20)];

  /** 長大（`huge.md` 相当）。**数百個でも詰まらないこと**を目で見るための story。 */
  const HUGE: OutlineItem[] = Array.from({ length: 400 }, (_, i) =>
    item((i % 3) + 1, `第 ${i + 1} 節 — 見出しがとても多いドキュメント`, i * 12),
  );

  function seed(outline: OutlineItem[]) {
    return () => {
      documentStore.meta = META;
      documentStore.outline = outline;
    };
  }
</script>

{#snippet pane()}
  <div class="sb-pane"><Outline /></div>
{/snippet}

<!-- 通常。見出しが 3 個以上あるので開いた状態で出る。 -->
<Story name="通常" loaders={[seed(TYPICAL)]} template={pane} />

<!--
  §2「見出しが 1 つも無いドキュメントでは、ペインを開いていても空であることを明示する」。
  空白のままにすると「まだ読み込んでいる」と読めてしまう。
-->
<Story name="見出しが無い" loaders={[seed([])]} template={pane} />

<!--
  §2「見出しがない、または 2 個以下のドキュメントでは自動的に折りたたむ」。
  畳んだ状態で出るが、押せば開く（判断を押し付けない）。
-->
<Story name="見出しが 2 個（自動で折りたたむ）" loaders={[seed(FEW)]} template={pane} />

<Story name="深い階層" loaders={[seed(DEEP)]} template={pane} />

<Story name="H2 から始まる文書" loaders={[seed(STARTS_AT_H2)]} template={pane} />

<!-- 400 個。スクロールできること、1 行の高さが崩れないことを見る。 -->
<Story name="長大（400 個）" loaders={[seed(HUGE)]} template={pane} />

<style>
  /* ライトペインの中に置かれた状態を再現する（幅は既定の 240px）。 */
  .sb-pane {
    display: flex;
    flex-direction: column;
    width: 240px;
    height: 100vh;
    border-left: 1px solid var(--mx-color-border-subtle);
    background: var(--mx-color-bg-subtle);
    color: var(--mx-color-fg);
    font-family: var(--mx-font-ui);
    font-size: var(--mx-font-size-ui);
  }
</style>
