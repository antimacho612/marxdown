<!--
@component
エディターの見本（ADR-0011 / ADR-0012）。

**エディターの設定はトークン層（CSS 変数）に出ない**ので、当てるスタイルをここで組む。
空欄のときの落とし先は `options.ts` と同じ `--mx-font-code`。

**表示倍率は掛けない。** 本文の見本（`--mx-font-size-content`）も掛けていないので、
2 つの見本の縮尺が揃う。倍率は本文にしか掛からない。
-->

<script lang="ts">
  import { ja } from '@/i18n/ja';
  import type { Palette } from '@/platform';

  import { formatFontFamily, paletteAttr } from '../appearance';

  interface Props {
    palette: Palette;
    /** `editor.fontFamily` の値そのまま。空欄なら既定のコードフォントに落ちる。 */
    fontFamily: string;
    fontSize: number;
    lineHeight: number;
    letterSpacing: number;
    ligatures: boolean;
    showLineNumbers: boolean;
  }

  let { palette, fontFamily, fontSize, lineHeight, letterSpacing, ligatures, showLineNumbers }: Props = $props();

  const style = $derived(
    [
      `font-family:${font()}`,
      `font-size:${String(fontSize)}px`,
      `line-height:${String(lineHeight)}`,
      `letter-spacing:${String(letterSpacing)}px`,
      `font-variant-ligatures:${ligatures ? 'normal' : 'none'}`,
    ].join(';'),
  );

  function font(): string {
    const family = formatFontFamily(fontFamily);
    if (family === null) return 'var(--mx-font-code)';
    return `${family}, var(--mx-font-code-stack)`;
  }
</script>

<!--
  記法の色は **`theme.ts` の `tokenRules()` と同じ対応**で塗る。
  見出しとリストの記号は Monarch では 1 つのトークン（`keyword.md`）になり、
  `--mx-color-code-function` が当たっている。ここで別の色を使うと、
  見本と実物が食い違う。
-->
<div class="mx-settings__sample mx-settings__sample--code" {style} data-mx-theme={paletteAttr(palette)}>
  {#if showLineNumbers}
    <span class="mx-settings__sample-gutter" aria-hidden="true">1<br />2<br />3<br />4</span>
  {/if}
  <pre class="mx-settings__sample-code"><span class="mx-settings__syntax-structure"># {ja.settings.sampleHeading}</span>

{ja.settings.sampleBody}<span class="mx-settings__syntax-inline">`code`</span>
<span class="mx-settings__syntax-structure">-</span> {ja.settings.sampleList}</pre>
</div>

<style>
  .mx-settings__sample {
    flex: none;
    padding: var(--mx-space-3);
    border: 1px solid var(--mx-color-border-subtle);
    border-radius: var(--mx-radius-sm);
    /* **配色は見本自身に乗る**（`ContentSample.svelte` と同じ理由）。 */
    background: var(--mx-color-bg);
    color: var(--mx-color-fg);
    overflow-x: auto;
  }

  .mx-settings__sample--code {
    display: flex;
    gap: var(--mx-space-3);
  }

  .mx-settings__sample-gutter {
    flex: none;
    color: var(--mx-color-fg-subtle);
    text-align: end;
    font-variant-numeric: tabular-nums;
  }

  .mx-settings__sample-code {
    margin: 0;
    font: inherit;
    letter-spacing: inherit;
    white-space: pre;
  }

  /* 見出し / リストの記号。`theme.ts` の `keyword.md` と同じトークン。 */
  .mx-settings__syntax-structure {
    color: var(--mx-color-code-function);
    font-weight: bold;
  }

  /* インラインコード。`theme.ts` の `variable.md` と同じトークン。 */
  .mx-settings__syntax-inline {
    color: var(--mx-color-code-builtin);
  }
</style>
