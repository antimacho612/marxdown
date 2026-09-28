<!--
  書き方と表示を並べる。表示はアプリの Markdown パイプラインでビルド時に作ったもので、アプリのプレビューと同じ CSS で表示する。
  Mermaid の図だけは、画面に入ったときにブラウザで描く（`client/mermaid.ts`）。
-->
<script lang="ts">
  import type { PageContext } from '../../context';
  import type { RenderedSection } from '../../server/guide';
  import Icon from '../Icon.svelte';

  const { ctx, sections }: { ctx: PageContext; sections: RenderedSection[] } = $props();
  const m = $derived(ctx.m);
</script>

<div class="guide__content">
  {#each sections as section (section.id)}
    <section class="syntax-section" id={section.id} aria-labelledby="{section.id}-title">
      <h2 class="guide__h2" id="{section.id}-title">{section.title}</h2>
      {#if section.intro}<p class="guide__intro">{section.intro}</p>{/if}

      {#each section.examples as example (example.id)}
        <article class="syntax-example" id={example.id} aria-labelledby="{example.id}-title">
          <header class="syntax-example__head">
            <h3 class="guide__h3" id="{example.id}-title">{example.title}</h3>
            {#if example.setting}
              <span class="badge" title={m.guide.requiresSetting}><code>{example.setting}</code></span>
            {/if}
          </header>
          <p class="syntax-example__body">{example.body}</p>

          <div class="syntax-pair">
            <div class="syntax-pane syntax-pane--source">
              <div class="syntax-pane__label">
                <span>{m.guide.source}</span>
                <button
                  class="icon-button icon-button--small"
                  type="button"
                  data-copy={example.raw}
                  aria-label={m.cli.copy}
                  title={m.cli.copy}
                >
                  <span class="copy-idle"><Icon name="copy" size={15} /></span>
                  <span class="copy-done"><Icon name="check" size={15} /></span>
                </button>
              </div>
              <pre class="syntax-code"><code
                  >{#each example.source as line, index (index)}<span class="syntax-code__line">{@html line}</span
                    >{/each}</code
                ></pre>
            </div>

            <div class="syntax-pane syntax-pane--result">
              <div class="syntax-pane__label"><span>{example.note ? m.guide.marpNote : m.guide.result}</span></div>
              {#if example.note}
                <div class="marp-deck">{@html example.html}</div>
                <p class="syntax-pane__note">{example.note}</p>
              {:else}
                <div class="mx-preview syntax-preview">
                  {#if example.frontMatter !== null}<pre class="mx-front-matter">{example.frontMatter}</pre>{/if}
                  <div class="mx-content">{@html example.html}</div>
                </div>
              {/if}
            </div>
          </div>
        </article>
      {/each}
    </section>
  {/each}
</div>
