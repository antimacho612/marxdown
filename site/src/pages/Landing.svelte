<script lang="ts">
  import Bytes from '../components/landing/Bytes.svelte';
  import Cli from '../components/landing/Cli.svelte';
  import Features from '../components/landing/Features.svelte';
  import Hero from '../components/landing/Hero.svelte';
  import Install from '../components/landing/Install.svelte';
  import Security from '../components/landing/Security.svelte';
  import Speed from '../components/landing/Speed.svelte';
  import Statement from '../components/landing/Statement.svelte';
  import Themes from '../components/landing/Themes.svelte';
  import Tour from '../components/landing/Tour.svelte';
  import Typography from '../components/landing/Typography.svelte';
  import SearchPalette from '../components/SearchPalette.svelte';
  import SiteFooter from '../components/SiteFooter.svelte';
  import SiteHeader from '../components/SiteHeader.svelte';
  import type { PageContext } from '../context';
  import type { LandingData } from '../server/landing';

  const { ctx, data }: { ctx: PageContext; data: LandingData } = $props();
</script>

<SiteHeader {ctx} />
<main id="main" class="landing">
  <Hero {ctx} {data} />
  <Statement {ctx} />
  <Speed {ctx} />
  <Tour {ctx} {data} />
  <Themes {ctx} {data} />
  <Typography {ctx} {data} />
  <Bytes {ctx} {data} />
  <Security {ctx} />
  <Features {ctx} />
  <Cli {ctx} />
  <Install {ctx} />
</main>
<SiteFooter {ctx} />
<SearchPalette {ctx} />
