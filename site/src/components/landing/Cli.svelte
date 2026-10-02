<script lang="ts">
  import type { PageContext } from '../../context';
  import Icon from '../Icon.svelte';

  const { ctx }: { ctx: PageContext } = $props();
  const m = $derived(ctx.m);
  const t = $derived(m.cli);
</script>

<section class="cli" aria-labelledby="cli-title">
  <div class="container cli__inner">
    <div class="cli__copy">
      <p class="eyebrow eyebrow--gold">{t.eyebrow}</p>
      <p class="cli__hero" data-reveal><span aria-hidden="true">&gt;</span> <code>{t.command}</code></p>
      <h2 class="title" id="cli-title" data-reveal>{t.title}</h2>
      <p class="lead" data-reveal style:--reveal-delay="80">{t.body}</p>
    </div>

    <div class="cli__terminal term term--static" data-reveal style:--reveal-delay="120">
      <div class="term__bar">
        <span class="term__tab">
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"
            ><rect x="1.5" y="2.5" width="13" height="11" rx="2" /><path d="M4.5 6l2 2-2 2M8 10.5h3.5" /></svg
          >
          {m.hero.terminalTitle}
        </span>
      </div>
      <ul class="cli__list">
        {#each t.examples as example (example.command)}
          <li class="cli__row">
            <span class="cli__comment"># {example.description}</span>
            <span class="cli__command">
              <span class="term__prompt" aria-hidden="true">&gt;</span>
              <code>{example.command}</code>
              <button
                class="cli__copy-button"
                type="button"
                data-copy={example.command}
                data-copied-label={t.copied}
                aria-label={`${t.copy}: ${example.command}`}
                title={t.copy}
              >
                <span class="copy-idle"><Icon name="copy" size={16} /></span>
                <span class="copy-done"><Icon name="check" size={16} /></span>
              </button>
            </span>
          </li>
        {/each}
      </ul>
    </div>
  </div>
</section>
