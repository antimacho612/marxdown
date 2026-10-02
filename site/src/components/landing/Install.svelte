<script lang="ts">
  import type { PageContext } from '../../context';
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
