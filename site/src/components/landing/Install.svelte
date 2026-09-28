<script lang="ts">
  import { LINKS, type PageContext } from '../../context';
  import AnimatedMark from '../AnimatedMark.svelte';
  import Icon from '../Icon.svelte';

  const { ctx }: { ctx: PageContext } = $props();
  const m = $derived(ctx.m);
  const t = $derived(m.install);
</script>

<section class="install" id="download" aria-labelledby="install-title">
  <div class="container">
    <header class="section-head section-head--center">
      <p class="eyebrow eyebrow--gold">{t.eyebrow}</p>
      <h2 class="title" id="install-title" data-reveal>{t.title}</h2>
    </header>

    <ol class="install__steps">
      {#each t.steps as step, index (step.title)}
        <li class="install__step" data-reveal style:--reveal-delay={index * 110}>
          <span class="install__number" aria-hidden="true">{index + 1}</span>
          <h3>{step.title}</h3>
          <p>{step.body}</p>
        </li>
      {/each}
    </ol>

    <div class="install__notes" data-reveal>
      <p>{t.smartScreen}</p>
      <p>{t.requirements}</p>
      <a href={ctx.href('start')}>{t.more}<Icon name="arrow" size={16} /></a>
    </div>
  </div>
</section>

<section class="cta" aria-labelledby="cta-title">
  <div class="cta__glow" aria-hidden="true"></div>
  <div class="container cta__inner">
    <div class="cta__mark" data-replay-on-view><AnimatedMark size={96} /></div>
    <h2 class="title cta__title" id="cta-title" data-reveal>{m.cta.title}</h2>
    <p class="lead" data-reveal style:--reveal-delay="80">{m.cta.body}</p>
    <div class="cta__actions" data-reveal style:--reveal-delay="140">
      <a class="button button--primary" href={LINKS.releases}><Icon name="download" />{m.cta.download}</a>
      <a class="button button--ghost" href={LINKS.repository}><Icon name="github" />{m.cta.github}</a>
    </div>
    <p class="hero__meta">{m.hero.downloadMeta(ctx.version)}</p>
  </div>
</section>
