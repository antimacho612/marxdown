<script lang="ts">
  import type { PageContext } from '../../context';
  import Icon from '../Icon.svelte';

  const { ctx }: { ctx: PageContext } = $props();
  const t = $derived(ctx.m.faq);
</script>

<section class="faq" id="faq" aria-labelledby="faq-title">
  <div class="container faq__inner">
    <header class="section-head">
      <p class="eyebrow">{t.eyebrow}</p>
      <h2 class="title" id="faq-title" data-reveal>{t.title}</h2>
    </header>

    <div class="faq__list">
      {#each t.items as item (item.question)}
        <details class="faq__item">
          <summary>
            <span>{item.question}</span>
            <span class="faq__chevron" aria-hidden="true"><Icon name="chevron" size={18} /></span>
          </summary>
          <p>{item.answer}</p>
        </details>
      {/each}
    </div>
  </div>
</section>
