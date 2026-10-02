<script lang="ts">
  import { LINKS, type PageContext } from '../../context';
  import AnimatedMark from '../AnimatedMark.svelte';
  import Icon from '../Icon.svelte';

  const { ctx }: { ctx: PageContext } = $props();
  const m = $derived(ctx.m);
</script>

<section class="cta" aria-labelledby="cta-title">
  <div class="cta__glow" aria-hidden="true"></div>
  <div class="container cta__inner">
    <div class="cta__mark" data-replay-on-view><AnimatedMark size={96} /></div>
    <h2 class="title cta__title" id="cta-title" data-reveal>{m.cta.title}</h2>
    <p class="lead" data-reveal style:--reveal-delay="80">{m.cta.body}</p>
    <div class="cta__actions" data-reveal style:--reveal-delay="140">
      <a
        class="button button--primary"
        href={LINKS.releases}
        data-goatcounter-click="download-install"
        data-goatcounter-title="Download (install)"><Icon name="download" />{m.cta.download}</a
      >
      <a
        class="button button--ghost"
        href={LINKS.repository}
        data-goatcounter-click="github-cta"
        data-goatcounter-title="GitHub (cta)"><Icon name="github" />{m.cta.github}</a
      >
    </div>
    <p class="hero__meta">{m.hero.downloadMeta(ctx.version)}</p>
  </div>
</section>
