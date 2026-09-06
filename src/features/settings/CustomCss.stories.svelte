<!--
  カスタム CSS（F-CONF-07 / 02.architecture/10-theming.md §3）。

  実アプリでこれを確かめるには `%APPDATA%` に `custom.css` を置いて再起動する必要があり、
  **とくに「効かないこと」の確認**（クロームを消そうとする CSS）が手間になる。
  ここでは本文とクロームを 1 画面に並べ、`applyCustomCss` を実アプリと同じ経路で
  呼んで、当たる範囲を目で見られるようにしてある。

  見どころは 3 つ。

  - カスタム CSS が**本文にだけ**当たる（`@scope (#mx-preview)`）
  - `h1 { … }` のような**素のセレクタ**が、既定の `.mx-preview h1 { … }` に勝つ
    （スコープ近接が詳細度より先に効く / CSS Cascade 6）
  - `}` でブロックを閉じて外へ出ようとする CSS は**丸ごと拒否**され、
    タイトルバーは消えない（06.roadmap/m1.5-shell-and-settings.md §3 の完了条件）
-->
<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import TitleBar from '@/app/TitleBar.svelte';
  import { documentStore } from '@/features/document';
  import type { DocumentMeta } from '@/platform';

  import { applyCustomCss } from './custom-css';

  const { Story } = defineMeta({
    title: 'シェル/カスタム CSS',
    parameters: { layout: 'fullscreen' },
  });

  const META: DocumentMeta = {
    path: 'C:\\Users\\me\\notes\\theme.md',
    eol: 'lf',
    bom: false,
    encoding: 'utf8',
    mtimeMs: 0,
    size: 512,
    readonly: false,
  };

  /** 見本。本文幅・見出し・引用の 3 か所を触る（`web.ts` の見本と同じ内容）。 */
  const SAMPLE = `:scope {
  --mx-content-width: 50ch;
}

h1 {
  color: rebeccapurple;
  border-bottom: 2px dashed currentColor;
}

blockquote {
  border-inline-start-width: 6px;
}
`;

  /**
   * **クロームを消そうとする CSS。** 2 行目の `}` でスコープを閉じ、
   * 以降をトップレベルに出そうとする。`applyCustomCss` はこれを拒否する。
   */
  const ESCAPING = `h1 { color: red }
}
.mx-titlebar { display: none }
`;

  /**
   * story ごとに当て直す。注入されるスタイル要素は `document.head` に 1 枚しか残らないので、
   * 切り替えたときに前の story の CSS が残らないよう、必ず全部の story で呼ぶ。
   */
  function seed(css: string | null) {
    return () => {
      documentStore.meta = META;
      applyCustomCss(css);
    };
  }
</script>

<!--
  本文の受け皿。実アプリでは `index.html` にあり、**コンポーネントツリーの外**にある
  （ADR-0005）。`@scope` の根はこの `id` なので、ここを変えると当たらなくなる。
-->
{#snippet stage()}
  <div class="sb-stage">
    <TitleBar />
    <div id="mx-preview" class="mx-preview">
      <div class="mx-content">
        <h1>カスタム CSS</h1>
        <p>
          <code>%APPDATA%\com.antimacho612.marxdown\custom.css</code> に置いた CSS は、 この本文にだけ当たる。設定項目は無く、ファイルが存在すれば効く。
        </p>
        <blockquote><p>変数の上書きは <code>:scope</code> に書く。</p></blockquote>
        <h2>当たらない場所</h2>
        <p>上のタイトルバー・ステータスバー・通知バーには効かない。</p>
      </div>
    </div>
  </div>
{/snippet}

<!-- 既定。カスタム CSS が無い状態（初回起動が常にこれ）。 -->
<Story name="カスタム CSS 無し" loaders={[seed(null)]} template={stage} />

<!-- 当たった状態。**素のセレクタが既定のスタイルに勝つ**ことがここで見える。 -->
<Story name="適用中" loaders={[seed(SAMPLE)]} template={stage} />

<!--
  **拒否される CSS。** タイトルバーが消えていないこと、本文にも何も当たっていないこと
  （部分適用を残さない）を確認する。実アプリではここで通知バーが出る。
-->
<Story name="クロームを消そうとする CSS (拒否)" loaders={[seed(ESCAPING)]} template={stage} />

<style>
  /* 実アプリの body grid（`shell.css`）の代わり。タイトルバーと本文を縦に積む。 */
  .sb-stage {
    display: grid;
    grid-template-rows: var(--mx-titlebar-height) 1fr;
    height: 100vh;
    background: var(--mx-color-bg);
  }
</style>
