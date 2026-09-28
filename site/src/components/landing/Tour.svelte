<!--
  読む・書く・探すの紹介。右のウィンドウは画面に留まり、左の段落が画面に入るたびに状態が切り替わる（`client/landing/tour.ts`）。
  ウィンドウの状態の切り替えはアプリと同じく即座に行い、押したキーだけを動きで見せる。
-->
<script lang="ts">
  import type { PageContext } from '../../context';
  import type { LandingData } from '../../server/landing';
  import AppWindow from '../AppWindow.svelte';
  import Keys from '../Keys.svelte';

  const { ctx, data }: { ctx: PageContext; data: LandingData } = $props();
  const m = $derived(ctx.m);
  const t = $derived(m.tour);

  const STEP_KEYS: Record<string, { keys: string; label: string }[]> = $derived({
    read: [],
    write: [{ keys: 'Ctrl+\\', label: t.keys.split }],
    format: [
      { keys: 'Ctrl+B', label: t.keys.bold },
      { keys: 'Shift+Alt+F', label: t.keys.align },
    ],
    find: [
      { keys: 'Ctrl+P', label: t.keys.quickOpen },
      { keys: 'Ctrl+Shift+P', label: t.keys.commandPalette },
    ],
  });

  function highlight(name: string, query: string): { before: string; match: string; after: string } {
    const index = name.toLowerCase().indexOf(query.toLowerCase());
    if (index < 0) return { before: name, match: '', after: '' };
    return {
      before: name.slice(0, index),
      match: name.slice(index, index + query.length),
      after: name.slice(index + query.length),
    };
  }
</script>

<section class="tour" id="features" aria-labelledby="tour-title">
  <div class="container">
    <header class="section-head">
      <p class="eyebrow">{t.eyebrow}</p>
      <h2 class="title" id="tour-title" data-reveal>{t.title}</h2>
    </header>

    <div class="tour__layout">
      <ol class="tour__steps">
        {#each t.steps as step, index (step.id)}
          <li class="tour__step" data-step={step.id}>
            <p class="tour__step-label"><span>{String(index + 1).padStart(2, '0')}</span>{step.label}</p>
            <h3 class="tour__step-title">{step.title}</h3>
            <p class="tour__step-body">{step.body}</p>
            {#if step.chips.length > 0}
              <ul class="chips">
                {#each step.chips as chip (chip)}<li>{chip}</li>{/each}
              </ul>
            {/if}
            {#if (STEP_KEYS[step.id] ?? []).length > 0}
              <ul class="tour__keys">
                {#each STEP_KEYS[step.id] ?? [] as item (item.keys)}
                  <li><Keys keys={item.keys} /><span>{item.label}</span></li>
                {/each}
              </ul>
            {/if}
          </li>
        {/each}
      </ol>

      <div class="tour__stage-col">
        <div
          class="tour__stage"
          data-tour-stage
          data-scale-box
          data-typed={data.samples.typed}
          data-bold={data.samples.boldTarget}
          data-query={t.quickOpenQuery}
          data-labels={JSON.stringify({ ...t.keys, explorer: m.window.explorer })}
        >
          <AppWindow
            {ctx}
            docs={[data.tour.design, data.tour.notes]}
            open={['design']}
            active="design"
            mode="preview"
            tree={data.tour.tree}
            width={960}
            height={620}
            class="tour__window"
          >
            {#snippet overlay()}
              <div class="mw__palette" data-quick-open hidden>
                <div class="mw__palette-input">
                  <span class="mw__palette-placeholder">{t.quickOpenPlaceholder}</span>
                  <span data-quick-open-input></span><span class="mw__caret"></span>
                </div>
                <ul>
                  {#each data.samples.quickOpen as file, index (file.name)}
                    {@const parts = highlight(file.name, t.quickOpenQuery)}
                    <li data-quick-open-item data-current={index === 0 ? '' : undefined}>
                      <span class="mw__palette-name">{parts.before}<mark>{parts.match}</mark>{parts.after}</span>
                      <span class="mw__palette-folder">{file.folder}</span>
                    </li>
                  {/each}
                </ul>
              </div>
              <div class="mw__keys" data-keys></div>
            {/snippet}
          </AppWindow>
          <template data-aligned-lines>{JSON.stringify(data.tour.alignedLines)}</template>
        </div>
      </div>
    </div>
  </div>
</section>
