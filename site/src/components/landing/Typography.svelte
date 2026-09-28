<!-- 文字サイズ・行間・本文幅・表の罫線を、その場で変えられる見本（`client/landing/typography.ts`）。 -->
<script lang="ts">
  import { SETTINGS_SCHEMA } from '@/platform/settings-schema';

  import type { PageContext } from '../../context';
  import type { LandingData } from '../../server/landing';
  import AppWindow from '../AppWindow.svelte';

  const { ctx, data }: { ctx: PageContext; data: LandingData } = $props();
  const m = $derived(ctx.m);
  const t = $derived(m.typography);

  const fontSize = SETTINGS_SCHEMA['preview.fontSize'].default;
  const lineHeight = SETTINGS_SCHEMA['preview.lineHeight'].default;
  const maxWidth = SETTINGS_SCHEMA['preview.maxWidth'].default;
  const tableStyle = SETTINGS_SCHEMA['preview.tableStyle'].default;

  const sliders = $derived([
    { key: 'preview.fontSize', label: t.fontSize, min: 12, max: 24, step: 1, value: fontSize, unit: 'px' },
    { key: 'preview.lineHeight', label: t.lineHeight, min: 1.2, max: 2.4, step: 0.05, value: lineHeight, unit: '' },
    { key: 'preview.maxWidth', label: t.maxWidth, min: 30, max: 100, step: 1, value: maxWidth, unit: 'ch' },
  ]);
</script>

<section class="typo" aria-labelledby="typo-title">
  <div class="container typo__inner">
    <div class="typo__copy">
      <p class="eyebrow">{t.eyebrow}</p>
      <h2 class="title" id="typo-title" data-reveal>{t.title}</h2>
      <p class="lead" data-reveal style:--reveal-delay="80">{t.body}</p>
    </div>

    <form class="typo__controls" data-typography data-reveal style:--reveal-delay="140">
      {#each sliders as slider (slider.key)}
        <label class="slider">
          <span class="slider__head">
            <span>{slider.label}</span>
            <output data-output={slider.key}>{slider.value}{slider.unit}</output>
          </span>
          <input
            type="range"
            name={slider.key}
            min={slider.min}
            max={slider.max}
            step={slider.step}
            value={slider.value}
            data-default={slider.value}
            data-unit={slider.unit}
          />
        </label>
      {/each}

      <fieldset class="typo__choice">
        <legend>{t.tableStyle}</legend>
        <div class="segmented">
          {#each ['lines', 'grid', 'zebra'] as const as style (style)}
            <label>
              <input type="radio" name="preview.tableStyle" value={style} checked={style === tableStyle} />
              <span>{t.tableStyles[style]}</span>
            </label>
          {/each}
        </div>
      </fieldset>

      <fieldset class="typo__choice">
        <legend>{t.font}</legend>
        <div class="segmented">
          {#each ['sans', 'serif'] as const as font (font)}
            <label>
              <input type="radio" name="font" value={font} checked={font === 'sans'} />
              <span>{t.fonts[font]}</span>
            </label>
          {/each}
        </div>
      </fieldset>

      <button class="button button--ghost button--small" type="reset">{t.reset}</button>
    </form>

    <div class="typo__visual" data-reveal style:--reveal-delay="100">
      <div class="typo__stage" data-scale-box>
        <AppWindow {ctx} docs={[data.typographyDoc]} width={760} height={520} class="typo__window" />
      </div>
      <pre class="typo__json" aria-label="settings.json"><code data-settings-json
          >{`{
  "preview.fontSize": ${fontSize},
  "preview.lineHeight": ${lineHeight},
  "preview.maxWidth": ${maxWidth},
  "preview.tableStyle": "${tableStyle}"
}`}</code
        ></pre>
    </div>
  </div>
</section>
