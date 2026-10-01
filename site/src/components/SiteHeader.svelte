<script lang="ts">
  import Mark from '@/lib/Mark.svelte';

  import { LINKS, type PageContext } from '../context';
  import { LOCALES } from '../routes';
  import Icon from './Icon.svelte';

  const { ctx }: { ctx: PageContext } = $props();
  const m = $derived(ctx.m);
  const route = $derived(ctx.route);
  const isGuide = $derived(route.page !== 'home');

  const LANGUAGE_NAMES = { ja: '日本語', en: 'English' } as const;
</script>

<a class="skip-link" href="#main">{m.nav.skip}</a>

<header class="site-header" data-site-header>
  <div class="container site-header__inner">
    <a class="brand" href={ctx.href('home')} aria-label="Marxdown">
      <Mark size={26} />
      <span>Marxdown</span>
    </a>

    <nav class="site-nav" id="site-nav" aria-label={m.nav.menu}>
      <a href={`${ctx.href('home')}#features`}>{m.nav.features}</a>
      <a href={ctx.href('start')} aria-current={isGuide ? 'page' : undefined}>{m.nav.guide}</a>
      <a href={LINKS.repository} rel="noopener">{m.nav.github}</a>
    </nav>

    <div class="site-header__actions">
      <button class="search-trigger" type="button" data-palette-open aria-label={m.nav.search}>
        <Icon name="search" />
        <span class="search-trigger__label">{m.nav.search}</span>
        <kbd>Ctrl K</kbd>
      </button>

      <details class="popover" data-popover>
        <summary class="icon-button" aria-label={m.nav.appearance} title={m.nav.appearance}>
          <span class="theme-icon theme-icon--light"><Icon name="sun" /></span>
          <span class="theme-icon theme-icon--dark"><Icon name="moon" /></span>
        </summary>
        <div class="popover__panel" role="menu" aria-label={m.nav.appearance}>
          <button type="button" role="menuitemradio" aria-checked="true" data-theme-choice="system">
            <Icon name="monitor" />{m.nav.appearanceOptions.system}
          </button>
          <button type="button" role="menuitemradio" aria-checked="false" data-theme-choice="light">
            <Icon name="sun" />{m.nav.appearanceOptions.light}
          </button>
          <button type="button" role="menuitemradio" aria-checked="false" data-theme-choice="dark">
            <Icon name="moon" />{m.nav.appearanceOptions.dark}
          </button>
        </div>
      </details>

      <details class="popover" data-popover>
        <summary class="icon-button" aria-label={m.nav.language} title={m.nav.language}>
          <Icon name="globe" />
        </summary>
        <div class="popover__panel" aria-label={m.nav.language}>
          {#each LOCALES as locale (locale)}
            <a
              href={ctx.href(route.page, locale)}
              hreflang={locale}
              lang={locale}
              aria-current={locale === route.locale ? 'true' : undefined}
              data-locale-link>{LANGUAGE_NAMES[locale]}</a
            >
          {/each}
        </div>
      </details>

      <a
        class="button button--primary button--small site-header__download"
        href={LINKS.releases}
        data-goatcounter-click="download-header"
        data-goatcounter-title="Download (header)"
      >
        <Icon name="download" />{m.nav.download}
      </a>

      <button
        class="icon-button menu-toggle"
        type="button"
        aria-controls="site-nav"
        aria-expanded="false"
        aria-label={m.nav.menu}
        data-menu-toggle
      >
        <Icon name="menu" />
      </button>
    </div>
  </div>
</header>
