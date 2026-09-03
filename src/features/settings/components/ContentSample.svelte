<!--
@component
本文（プレビュー）の見本（ADR-0011）。

**器はプレビューの面を真似ない。** ここで見せたいのは文字の並びだけで、
背景や余白まで似せると「これが本文の見た目そのもの」に読めてしまう。

**当てる値は書かない。** 本文のタイポグラフィはトークン層（CSS 変数）に出ているので、
`applyAppearance` が `:root` に積んだものをそのまま着る。
-->

<script lang="ts">
  import { ja } from '@/i18n/ja';
  import type { Palette } from '@/platform';

  import { paletteAttr } from '../appearance';

  interface Props {
    palette: Palette;
  }

  let { palette }: Props = $props();
</script>

<div class="mx-settings__sample mx-settings__sample--content" data-mx-theme={paletteAttr(palette)}>
  <strong class="mx-settings__sample-heading">{ja.settings.sampleHeading}</strong>
  <p class="mx-settings__sample-body">
    {ja.settings.sampleBody}
    <code class="mx-settings__sample-code-chip">code</code>
  </p>
</div>

<style>
  .mx-settings__sample {
    flex: none;
    padding: var(--mx-space-3);
    border: 1px solid var(--mx-color-border-subtle);
    border-radius: var(--mx-radius-sm);
    /*
     * **配色は見本自身に乗る**（`data-mx-theme` / ADR-0013）。
     * 背景と文字色をここで明示しないと、上書きしたトークンが誰にも読まれず、
     * ダイアログ（＝クロームの配色）のままになる。
     */
    background: var(--mx-color-bg);
    color: var(--mx-color-fg);
    overflow-x: auto;
  }

  .mx-settings__sample--content {
    font-family: var(--mx-font-content);
    font-size: var(--mx-font-size-content);
    line-height: var(--mx-line-height);
  }

  .mx-settings__sample-heading {
    display: block;
    font-size: 1.25em;
  }

  .mx-settings__sample-body {
    margin: var(--mx-space-2) 0 0;
  }

  /* 本文の見本に混ぜるコード。**面の色が変わったことが分かる印**になる。 */
  .mx-settings__sample-code-chip {
    padding: 0 0.3em;
    border-radius: var(--mx-radius-sm);
    background: var(--mx-color-bg-subtle);
    color: var(--mx-color-code-builtin);
    font-family: var(--mx-font-code);
    font-size: 0.9em;
  }
</style>
