<!--
  組み込みの配色の見本。押した配色を、上のウィンドウにアプリと同じ変数で当てる（`client/landing/themes.ts`）。
  配色の一覧は横に流れ続ける。ポインタを重ねるかフォーカスすると止まる。
-->
<script lang="ts">
  import type { PageContext } from '../../context';
  import type { LandingData, PresetSwatch } from '../../server/landing';
  import AppWindow from '../AppWindow.svelte';
  import Icon from '../Icon.svelte';

  const { ctx, data }: { ctx: PageContext; data: LandingData } = $props();
  const m = $derived(ctx.m);
  const t = $derived(m.themes);

  // ライトだけの配色は 1 枚しかないため、明暗では分けずに 2 列へ交互に振り分ける。
  const rows = $derived([0, 1].map((row) => data.presets.filter((_, index) => index % 2 === row)));

  function swatchStyle(preset: PresetSwatch): string {
    const pair = (name: string, [light, dark]: [string, string]) => `--sw-${name}: light-dark(${light}, ${dark});`;
    return [
      pair('bg', preset.bg),
      pair('fg', preset.fg),
      pair('accent', preset.accent),
      pair('keyword', preset.keyword),
      pair('string', preset.string),
    ].join('');
  }
</script>

<section class="themes" aria-labelledby="themes-title">
  <div class="container">
    <header class="section-head section-head--center">
      <p class="eyebrow eyebrow--rose">{t.eyebrow}</p>
      <h2 class="title" id="themes-title" data-reveal>{t.title}</h2>
      <p class="lead" data-reveal style:--reveal-delay="80">{t.body}</p>
    </header>

    <div class="themes__stage" data-scale-box data-reveal>
      <AppWindow {ctx} docs={[data.themeDoc]} mode="split" width={1100} height={560} class="themes__window" />
    </div>
  </div>

  <div class="themes__gallery" data-theme-gallery data-default-css={data.defaultDeclarations}>
    <div class="container themes__toolbar">
      <p class="themes__current">
        <span>{t.current}</span>
        <strong data-theme-name>{t.defaultName}</strong>
      </p>
      <div class="segmented" role="radiogroup" aria-label={t.scheme} data-scheme-toggle>
        <button type="button" role="radio" aria-checked="true" data-scheme="light">
          <Icon name="sun" size={16} />{t.schemeLight}
        </button>
        <button type="button" role="radio" aria-checked="false" data-scheme="dark">
          <Icon name="moon" size={16} />{t.schemeDark}
        </button>
      </div>
    </div>

    {#each rows as presets, row (row)}
      <div class="marquee" data-direction={row % 2 === 0 ? 'left' : 'right'}>
        <div class="marquee__viewport">
          <div class="marquee__track" style:--count={presets.length}>
            {#each [0, 1] as copy (copy)}
              <div class="marquee__set" aria-hidden={copy === 1 ? 'true' : undefined} inert={copy === 1}>
                {#each presets as preset (preset.id)}
                  <button
                    type="button"
                    class="swatch"
                    data-preset={preset.id}
                    data-preset-scheme={preset.scheme}
                    data-label={preset.label}
                    aria-pressed={preset.id === 'default' ? 'true' : 'false'}
                    style={swatchStyle(preset)}
                    style:color-scheme={preset.scheme === 'both' ? undefined : preset.scheme}
                  >
                    <span class="swatch__chip" aria-hidden="true">
                      <i class="swatch__line swatch__line--a"></i>
                      <i class="swatch__line swatch__line--b"></i>
                      <i class="swatch__dot"></i>
                    </span>
                    <span class="swatch__name">{preset.label}</span>
                  </button>
                {/each}
              </div>
            {/each}
          </div>
        </div>
      </div>
    {/each}

    <div class="container">
      <figure class="themes__custom" data-reveal>
        <figcaption>{t.custom}</figcaption>
        <pre><code
            ><span class="c-comment">/* themes/my-theme.css */</span>
<span class="c-prop">--mx-color-bg</span>: <span class="c-fn">light-dark</span>(<span class="c-value">#fdfcf8</span
            >, <span class="c-value">#16161a</span>);
<span class="c-prop">--mx-color-fg</span>: <span class="c-fn">light-dark</span>(<span class="c-value">#23211c</span
            >, <span class="c-value">#e8e6e3</span>);
<span class="c-prop">--mx-color-accent</span>: <span class="c-value">#d9480f</span>;</code
          ></pre>
      </figure>
    </div>
  </div>
</section>
