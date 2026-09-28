<script lang="ts">
  import type { PageContext } from '../../context';
  import type { Shortcuts } from '../../server/keybindings';
  import FilterField from './FilterField.svelte';

  const { ctx, shortcuts }: { ctx: PageContext; shortcuts: Shortcuts } = $props();
  const m = $derived(ctx.m);
</script>

<div class="guide__content">
  {#each shortcuts.intro as paragraph, index (index)}
    <p class="guide__intro">{@html paragraph}</p>
  {/each}

  <FilterField placeholder={m.guide.shortcutFilterPlaceholder} empty={m.guide.noMatch} />

  {#each shortcuts.sections as section (section.id)}
    <section class="kb-section" id={section.id} data-filter-group aria-labelledby="{section.id}-title">
      <h2 class="guide__h2" id="{section.id}-title">{section.title}</h2>
      <ul class="kb-list">
        {#each section.rows as row, index (index)}
          <li class="kb-row" data-filter-item data-filter-text={`${row.action} ${row.keysText}`.toLowerCase()}>
            <span class="kb-row__action">{row.action}</span>
            <span class="kb-row__keys">{@html row.keys}</span>
          </li>
        {/each}
      </ul>
      {#each section.notes as note, index (index)}
        <p class="guide__note">{@html note}</p>
      {/each}
    </section>
  {/each}
</div>
