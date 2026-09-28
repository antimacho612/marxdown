<script lang="ts">
  import GuideSettings from '../components/guide/GuideSettings.svelte';
  import GuideShortcuts from '../components/guide/GuideShortcuts.svelte';
  import GuideSyntax from '../components/guide/GuideSyntax.svelte';
  import Icon from '../components/Icon.svelte';
  import SearchPalette from '../components/SearchPalette.svelte';
  import SiteFooter from '../components/SiteFooter.svelte';
  import SiteHeader from '../components/SiteHeader.svelte';
  import type { PageContext } from '../context';
  import { GUIDE_PAGES, type GuidePageId } from '../routes';
  import type { GuideData } from '../server/guide';

  const { ctx, data }: { ctx: PageContext; data: GuideData } = $props();
  const m = $derived(ctx.m);
  const page = $derived(data.page);
  const index = $derived(GUIDE_PAGES.indexOf(page));
  const prev: GuidePageId | undefined = $derived(GUIDE_PAGES[index - 1]);
  const next: GuidePageId | undefined = $derived(GUIDE_PAGES[index + 1]);
  const toc = $derived(
    data.page === 'settings'
      ? [...data.toc, { id: 'custom-themes', title: m.guide.customThemes.title, level: 2 }]
      : data.toc,
  );
</script>

<SiteHeader {ctx} />

<div class="guide container">
  <aside class="guide__sidebar" aria-label={m.guide.title}>
    <nav class="guide__nav">
      <p class="guide__nav-title">{m.guide.title}</p>
      <ul>
        {#each GUIDE_PAGES as item (item)}
          <li>
            <a href={ctx.href(item)} aria-current={item === page ? 'page' : undefined}>{m.guide.pages[item]}</a>
          </li>
        {/each}
      </ul>
    </nav>
  </aside>

  <main id="main" class="guide__main">
    <header class="guide__header">
      <p class="eyebrow">{m.guide.title}</p>
      <h1 class="guide__title">{m.guide.pages[page]}</h1>
      <!-- ショートカットのページは、元の文書（`docs/keybindings.md`）の最初の段落が同じ説明を持つ。 -->
      {#if page !== 'shortcuts'}<p class="lead">{m.guide.descriptions[page]}</p>{/if}
    </header>

    {#if data.page === 'start'}
      <div class="mx-preview guide__prose">
        <div class="mx-content">{@html data.html}</div>
      </div>
    {:else if data.page === 'shortcuts'}
      <GuideShortcuts {ctx} shortcuts={data.shortcuts} />
    {:else if data.page === 'syntax'}
      <GuideSyntax {ctx} sections={data.sections} />
    {:else}
      <GuideSettings {ctx} categories={data.categories} />
    {/if}

    <nav class="guide__pager" aria-label={m.guide.title}>
      {#if prev}
        <a class="guide__pager-link guide__pager-link--prev" href={ctx.href(prev)}>
          <span>{m.guide.prev}</span>
          <strong>{m.guide.pages[prev]}</strong>
        </a>
      {/if}
      {#if next}
        <a class="guide__pager-link guide__pager-link--next" href={ctx.href(next)}>
          <span>{m.guide.next}</span>
          <strong>{m.guide.pages[next]}<Icon name="arrow" size={16} /></strong>
        </a>
      {/if}
    </nav>
  </main>

  <aside class="guide__toc" aria-labelledby="toc-title">
    <p class="guide__toc-title" id="toc-title">{m.guide.onThisPage}</p>
    <ul data-toc>
      {#each toc as item (item.id)}
        <li class="guide__toc-item guide__toc-item--{item.level}">
          <a href={`#${item.id}`} data-toc-link={item.id}>{item.title}</a>
        </li>
      {/each}
    </ul>
  </aside>
</div>

<SiteFooter {ctx} />
<SearchPalette {ctx} />
