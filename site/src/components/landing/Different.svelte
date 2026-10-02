<!-- VS Code と並べて、Marxdown が受け持つ場面を示す。優劣ではなく役割の違いとして書く。 -->
<script lang="ts">
  import type { PageContext } from '../../context';
  import Icon from '../Icon.svelte';

  const { ctx }: { ctx: PageContext } = $props();
  const t = $derived(ctx.m.different);
</script>

<section class="different" aria-labelledby="different-title">
  <div class="container">
    <header class="section-head section-head--center">
      <p class="eyebrow">{t.eyebrow}</p>
      <h2 class="title" id="different-title" data-reveal>{t.title}</h2>
      <p class="lead" data-reveal style:--reveal-delay="80">{t.body}</p>
    </header>

    <div class="different__grid">
      {#each t.columns as column, index (column.name)}
        <article
          class="different__card"
          class:different__card--ours={index === 1}
          data-reveal
          style:--reveal-delay={index * 110}
        >
          <h3 class="different__name">{column.name}</h3>
          <p class="different__role">{column.role}</p>
          <ul class="different__points">
            {#each column.points as point (point)}
              <li><Icon name="check" size={16} />{point}</li>
            {/each}
          </ul>
        </article>
      {/each}
    </div>
  </div>
</section>
