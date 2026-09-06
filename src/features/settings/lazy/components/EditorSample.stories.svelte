<!--
  エディターの見本。

  **エディターの設定はトークン層に出ない**ので、当てるスタイルはこの部品が自分で組む。
  記法の色は `theme.ts` の `tokenRules()` と同じ対応で、見出しとリストの記号が
  同じトークン（`keyword.md`）になるのは Monarch 側の都合をそのまま写しているため。

  **表示倍率は掛けない。** 本文の見本と縮尺を揃えてある。
-->
<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import EditorSample from './EditorSample.svelte';

  const { Story } = defineMeta({
    title: '設定/components/エディターの見本',
    component: EditorSample,
    parameters: { layout: 'padded' },
    args: {
      palette: 'default',
      fontFamily: '',
      fontSize: 14,
      lineHeight: 1.6,
      letterSpacing: 0,
      ligatures: false,
      showLineNumbers: true,
    },
  });
</script>

<Story name="既定" />

<!-- 行番号を切ったとき。**溝ごと消える**（幅だけ残さない）。 -->
<Story name="行番号なし" args={{ showLineNumbers: false }} />

<!-- フォント名は `formatFontFamily` を通る。無いフォントを書いても既定に落ちる。 -->
<Story
  name="調整済み"
  args={{ fontFamily: 'Cascadia Code', fontSize: 16, lineHeight: 2, letterSpacing: 0.5, ligatures: true }}
/>

<Story name="Solarized" args={{ palette: 'solarized' }} />
<Story name="Gruvbox" args={{ palette: 'gruvbox' }} />

{#snippet all()}
  <div style="display: flex; flex-direction: column; gap: 12px;">
    <EditorSample
      palette="default"
      fontFamily=""
      fontSize={14}
      lineHeight={1.6}
      letterSpacing={0}
      ligatures={false}
      showLineNumbers={true}
    />
    <EditorSample
      palette="github"
      fontFamily=""
      fontSize={14}
      lineHeight={1.6}
      letterSpacing={0}
      ligatures={false}
      showLineNumbers={true}
    />
    <EditorSample
      palette="solarized"
      fontFamily=""
      fontSize={14}
      lineHeight={1.6}
      letterSpacing={0}
      ligatures={false}
      showLineNumbers={true}
    />
    <EditorSample
      palette="nord"
      fontFamily=""
      fontSize={14}
      lineHeight={1.6}
      letterSpacing={0}
      ligatures={false}
      showLineNumbers={true}
    />
    <EditorSample
      palette="gruvbox"
      fontFamily=""
      fontSize={14}
      lineHeight={1.6}
      letterSpacing={0}
      ligatures={false}
      showLineNumbers={true}
    />
  </div>
{/snippet}

<Story name="並べた時" template={all} parameters={{ controls: { disable: true } }} />
