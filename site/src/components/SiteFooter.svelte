<script lang="ts">
  import Mark from '@/lib/Mark.svelte';

  import { LINKS, type PageContext } from '../context';
  import { GUIDE_PAGES } from '../routes';

  const { ctx }: { ctx: PageContext } = $props();
  const m = $derived(ctx.m);
</script>

<footer class="site-footer">
  <div class="container">
    <div class="site-footer__grid">
      <div class="site-footer__brand">
        <a class="brand" href={ctx.href('home')} aria-label="Marxdown">
          <Mark size={26} />
          <span>Marxdown</span>
        </a>
        <p>{m.footer.tagline}</p>
      </div>

      <nav aria-labelledby="footer-product">
        <h2 id="footer-product">{m.footer.product}</h2>
        <ul>
          <li><a href={`${ctx.href('home')}#features`}>{m.footer.features}</a></li>
          <li><a href={LINKS.releases}>{m.footer.download}</a></li>
          <li><a href={LINKS.changelog}>{m.footer.changelog}</a></li>
        </ul>
      </nav>

      <nav aria-labelledby="footer-guide">
        <h2 id="footer-guide">{m.footer.guide}</h2>
        <ul>
          {#each GUIDE_PAGES as page (page)}
            <li><a href={ctx.href(page)}>{m.guide.pages[page]}</a></li>
          {/each}
        </ul>
      </nav>

      <nav aria-labelledby="footer-community">
        <h2 id="footer-community">{m.footer.community}</h2>
        <ul>
          <li><a href={LINKS.repository}>{m.footer.source}</a></li>
          <li><a href={LINKS.bug}>{m.footer.issues}</a></li>
          <li><a href={LINKS.feature}>{m.footer.ideas}</a></li>
          <li><a href={LINKS.security}>{m.footer.security}</a></li>
        </ul>
      </nav>
    </div>

    <div class="site-footer__bottom">
      <span>© 2026 antimacho612</span>
      <a href={LINKS.license}>{m.footer.license}</a>
    </div>
  </div>
</footer>
