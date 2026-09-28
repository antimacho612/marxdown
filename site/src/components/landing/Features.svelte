<script lang="ts">
  import type { PageContext } from '../../context';
  import Icon, { type IconName } from '../Icon.svelte';
  import Keys from '../Keys.svelte';

  const { ctx }: { ctx: PageContext } = $props();
  const m = $derived(ctx.m);
</script>

<section class="features" aria-labelledby="features-title">
  <div class="container">
    <header class="section-head">
      <p class="eyebrow">{m.features.eyebrow}</p>
      <h2 class="title" id="features-title" data-reveal>{m.features.title}</h2>
    </header>

    <ul class="features__grid" data-spotlight>
      {#each m.features.items as item, index (item.title)}
        <li class="feature" data-reveal style:--reveal-delay={(index % 4) * 70}>
          <span class="feature__icon"><Icon name={item.icon as IconName} size={22} /></span>
          <h3 class="feature__title">{item.title}</h3>
          <p class="feature__body">{item.body}</p>
          {#if item.keys}<Keys keys={item.keys} />{/if}
        </li>
      {/each}
    </ul>
  </div>
</section>
