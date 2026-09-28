<!--
  信頼できない Markdown を開いたときの防御を、1 行ずつ止める様子で見せる（`client/landing/security.ts`）。
  右の結果は、アプリが実際に表示するもの（フォルダーの外の画像の代わりに出す枠）と同じ文言・同じクラスで組む。
-->
<script lang="ts">
  import { en as enCore } from '@/i18n/en/core';
  import { ja as jaCore } from '@/i18n/ja/core';

  import type { PageContext } from '../../context';
  import Icon from '../Icon.svelte';

  const { ctx }: { ctx: PageContext } = $props();
  const m = $derived(ctx.m);
  const t = $derived(m.security);
  const core = $derived(ctx.route.locale === 'ja' ? jaCore : enCore);
  const blockedPath = 'C:/Users/you/Pictures/private.png';
</script>

<section class="security" aria-labelledby="security-title">
  <div class="container">
    <div class="security__panel force-dark">
      <div class="security__glow" aria-hidden="true"></div>
      <header class="section-head security__head">
        <p class="eyebrow eyebrow--rose">{t.eyebrow}</p>
        <h2 class="title" id="security-title" data-reveal>{t.title}</h2>
        <p class="lead" data-reveal style:--reveal-delay="80">{t.body}</p>
      </header>

      <div class="security__demo" data-security>
        <div class="security__file">
          <div class="security__file-bar">
            <Icon name="file" size={16} />
            <span>{t.file}</span>
          </div>
          <ol class="security__threats">
            {#each t.threats as threat, index (index)}
              <li class="security__threat" style:--i={index} data-threat>
                <code class="security__code">{threat.code}</code>
                <span class="security__layer"><Icon name="shield" size={14} />{t.layers[index]}</span>
                <span class="security__verdict">
                  <Icon name="check" size={16} />
                  {threat.verdict}
                </span>
              </li>
            {/each}
          </ol>
        </div>

        <div class="security__result">
          <p class="security__result-label"><Icon name="check" size={16} />{t.safe}</p>
          <div class="mx-preview security__preview" aria-hidden="true" inert>
            <div class="mx-content">
              <p><a href="#security-title">{ctx.route.locale === 'ja' ? '続きを読む' : 'Read more'}</a></p>
              <p>
                <span class="mx-image-blocked" data-mx-reason="out-of-scope">
                  <span class="mx-image-blocked__reason">{core.preview.imageOutOfScope}</span>
                  <code class="mx-image-blocked__path">{blockedPath}</code>
                  <button type="button" class="mx-image-blocked__allow">{core.preview.imageAllow}</button>
                </span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>
