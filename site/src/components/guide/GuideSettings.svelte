<script lang="ts">
  import type { PageContext } from '../../context';
  import type { SettingCategory } from '../../server/settings';
  import Icon from '../Icon.svelte';
  import FilterField from './FilterField.svelte';

  const { ctx, categories }: { ctx: PageContext; categories: SettingCategory[] } = $props();
  const m = $derived(ctx.m);
  const t = $derived(m.guide);
  const range = $derived(ctx.route.locale === 'ja' ? '〜' : '–');

  /** 配色ファイルで上書きできる変数（`features/theme/lazy/preset.ts` の `TOKENS`）。 */
  const VARIABLES = {
    surface: ['bg', 'bg-subtle', 'bg-inset', 'bg-hover'],
    text: ['fg', 'fg-muted', 'fg-subtle'],
    border: ['border', 'border-subtle'],
    accent: ['accent'],
    code: [
      'code-comment',
      'code-keyword',
      'code-string',
      'code-number',
      'code-function',
      'code-variable',
      'code-builtin',
    ],
  } as const;
</script>

<div class="guide__content">
  <p class="guide__intro">{t.settingsIntro}</p>

  <FilterField placeholder={t.settingFilterPlaceholder} empty={t.noMatch} />

  {#each categories as category (category.id)}
    <section class="settings-category" id={category.id} data-filter-group aria-labelledby="{category.id}-title">
      <h2 class="guide__h2" id="{category.id}-title">{category.label}</h2>
      {#each category.groups as group, index (index)}
        {#if group.label}<h3 class="guide__h3 settings-group">{group.label}</h3>{/if}
        <ul class="settings-list">
          {#each group.items as item (item.key)}
            <li
              class="setting"
              id={item.key}
              data-filter-item
              data-filter-text={`${item.label} ${item.key} ${item.description}`.toLowerCase()}
            >
              <div class="setting__head">
                <h4 class="setting__label">{item.label}</h4>
                <span class="setting__key">
                  <code>{item.key}</code>
                  <button
                    class="icon-button icon-button--small"
                    type="button"
                    data-copy={item.key}
                    aria-label={`${t.copyKey}: ${item.key}`}
                    title={t.copyKey}
                  >
                    <span class="copy-idle"><Icon name="copy" size={14} /></span>
                    <span class="copy-done"><Icon name="check" size={14} /></span>
                  </button>
                </span>
              </div>
              {#if item.description}<p class="setting__description">{item.description}</p>{/if}
              <dl class="setting__meta">
                <div>
                  <dt>{t.settingDefault}</dt>
                  <dd>{item.defaultValue ?? t.settingEmpty}</dd>
                </div>
                {#if item.range}
                  <div>
                    <dt>{t.settingRange}</dt>
                    <dd>{item.range.min}{range}{item.range.max}</dd>
                  </div>
                {/if}
                {#if item.options.length > 0}
                  <div class="setting__options">
                    <dt>{t.settingOptions}</dt>
                    <dd>
                      <ul>
                        {#each item.options as option (option.value)}
                          <li><span>{option.label}</span><code>{option.value}</code></li>
                        {/each}
                      </ul>
                    </dd>
                  </div>
                {/if}
              </dl>
            </li>
          {/each}
        </ul>
      {/each}
    </section>
  {/each}

  <section class="settings-category" id="custom-themes" aria-labelledby="custom-themes-title">
    <h2 class="guide__h2" id="custom-themes-title">{t.customThemes.title}</h2>
    {#each t.customThemes.body as paragraph, index (index)}
      <p class="guide__intro">{paragraph}</p>
    {/each}
    <p class="guide__label">{t.customThemes.location}</p>
    <pre class="guide__code"><code>%APPDATA%\com.antimacho612.marxdown\themes\&lt;name&gt;.css</code></pre>
    <pre class="guide__code"><code
        ><span class="c-prop">--mx-color-bg</span>: <span class="c-fn">light-dark</span>(<span class="c-value"
          >#ffffff</span
        >, <span class="c-value">#101010</span>);
<span class="c-prop">--mx-color-fg</span>: <span class="c-fn">light-dark</span>(<span class="c-value">#1c2024</span
        >, <span class="c-value">#edeef0</span>);
<span class="c-prop">--mx-color-code-string</span>: <span class="c-value">#0f766e</span>;</code
      ></pre>
    <p class="guide__label">{t.customThemes.variables}</p>
    <dl class="variables">
      {#each Object.entries(VARIABLES) as [group, names] (group)}
        <div>
          <dt>{t.customThemes.groups[group as keyof typeof VARIABLES]}</dt>
          <dd>
            {#each names as name (name)}<code>--mx-color-{name}</code>{/each}
          </dd>
        </div>
      {/each}
    </dl>
  </section>
</div>
