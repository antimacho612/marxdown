<script lang="ts">
  import type { PageContext } from '../../context';

  const { ctx }: { ctx: PageContext } = $props();
  const t = $derived(ctx.m.ai);
</script>

<section class="ai" aria-labelledby="ai-title">
  <div class="container ai__inner">
    <div class="ai__copy">
      <p class="eyebrow eyebrow--rose">{t.eyebrow}</p>
      <h2 class="title" id="ai-title" data-reveal>{t.title}</h2>
      <p class="lead" data-reveal style:--reveal-delay="80">{t.body}</p>
      <ul class="chips" data-reveal style:--reveal-delay="140">
        {#each t.kinds as kind (kind)}<li>{kind}</li>{/each}
      </ul>
    </div>

    <ol class="ai__points">
      {#each t.points as point, index (point.title)}
        <li class="ai__point" data-reveal style:--reveal-delay={index * 90}>
          <h3>{point.title}</h3>
          <p>{point.body}</p>
          {#if point.command}
            <code class="ai__command"><span class="ai__prompt" aria-hidden="true">&gt;</span>{point.command}</code>
          {/if}
        </li>
      {/each}
    </ol>
  </div>
</section>
