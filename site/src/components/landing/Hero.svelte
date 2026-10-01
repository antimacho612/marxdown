<script lang="ts">
  import { LINKS, type PageContext } from '../../context';
  import { splitEmphasis } from '../../lib/emphasis';
  import type { LandingData } from '../../server/landing';
  import AnimatedMark from '../AnimatedMark.svelte';
  import AppWindow from '../AppWindow.svelte';
  import Icon from '../Icon.svelte';
  import Terminal from '../Terminal.svelte';

  const { ctx, data }: { ctx: PageContext; data: LandingData } = $props();
  const m = $derived(ctx.m);
  const [before, after] = $derived(m.hero.lead.split('{command}', 2));
</script>

<section class="hero" aria-labelledby="hero-title">
  <div class="hero__backdrop" aria-hidden="true">
    <span class="orb orb--indigo"></span>
    <span class="orb orb--rose"></span>
    <span class="orb orb--gold"></span>
    <span class="hero__grid"></span>
  </div>

  <div class="container hero__inner">
    <div class="hero__mark"><AnimatedMark size={76} /></div>

    <a class="hero__badge" href={LINKS.changelog}>
      <span class="hero__badge-dot" aria-hidden="true"></span>
      <span>{m.hero.badge(ctx.version)}</span>
      <span class="hero__badge-link">{m.hero.badgeLink}<Icon name="arrow" size={14} /></span>
    </a>

    <h1 class="hero__title display" id="hero-title">
      {#each m.hero.titleLines as line, index (index)}
        <span class="hero__line" style:--line={index}>
          {#each splitEmphasis(line) as segment, j (j)}
            {#if segment.em}<span class="gradient-text">{segment.text}</span>{:else}{segment.text}{/if}
          {/each}
        </span>
      {/each}
    </h1>

    <p class="lead hero__lead">
      {before}<code class="hero__command">{m.hero.leadCommand}</code>{after}
    </p>

    <div class="hero__actions">
      <a
        class="button button--primary hero__download"
        href={LINKS.releases}
        data-goatcounter-click="download-hero"
        data-goatcounter-title="Download (hero)"
      >
        <Icon name="download" />{m.hero.download}
      </a>
      <a class="button button--ghost" href={ctx.href('start')}>
        {m.hero.guide}<Icon name="arrow" />
      </a>
    </div>
    <p class="hero__meta">{m.hero.downloadMeta(ctx.version)}</p>
  </div>

  <div class="container hero__stage-wrap">
    <div class="hero__stage" data-hero-stage data-commands={JSON.stringify(m.hero.commands)}>
      <div class="hero__window-slot" data-scale-box>
        <AppWindow {ctx} docs={data.hero} class="hero__window" width={1040} height={600} />
      </div>
      <Terminal class="hero__terminal" title={m.hero.terminalTitle} prompt={m.hero.prompt} commands={m.hero.commands} />
      <button class="hero__replay" type="button" data-hero-replay hidden>
        <Icon name="replay" size={16} />{m.hero.replay}
      </button>
    </div>
  </div>
</section>
