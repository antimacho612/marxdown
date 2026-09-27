<!--
@component
見本の入口（ADR-0011）。

`SettingsDialog` が動的 import するのはこのファイルだけで、ここから先が `sample` チャンクになる。
見本を描くのは「プレビュー」「エディター」のカテゴリだけであり、既定のカテゴリ（外観）には無い。
設定を開いただけでは読み込まれない。

設定値から props を組み立てる処理をここに置いているのは、呼び出し側に並べさせるとその分が `settings` チャンクに残るためである。
-->

<script lang="ts">
  import type { Settings } from '@/platform';

  import ContentSample from './ContentSample.svelte';
  import EditorSample from './EditorSample.svelte';

  interface Props {
    sample: 'content' | 'editor';
    values: Settings;
  }

  let { sample, values }: Props = $props();
</script>

{#if sample === 'content'}
  <ContentSample palette={values['preview.theme']} />
{:else}
  <EditorSample
    palette={values['editor.theme']}
    fontFamily={values['editor.fontFamily']}
    fontSize={values['editor.fontSize']}
    lineHeight={values['editor.lineHeight']}
    letterSpacing={values['editor.letterSpacing']}
    ligatures={values['editor.fontLigatures']}
    showLineNumbers={values['editor.lineNumbers'] !== 'off'}
  />
{/if}
