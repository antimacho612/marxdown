<script lang="ts">
  import Mark from '@/lib/Mark.svelte';

  import type { PageContext } from '../../context';

  const { ctx }: { ctx: PageContext } = $props();
  const m = $derived(ctx.m);

  const FILES = ['design.md', 'notes.md', 'todo.md'];
  /** 3 つのターミナルからウィンドウのタブ列へ向かう線。座標は `.speed__diagram` の論理上の大きさ（560 × 420）に合わせる。 */
  const WIRES = FILES.map((_, index) => {
    const y = 72 + index * 110;
    return `M236 ${y} C 272 ${y}, 268 118, 304 118`;
  });
</script>

<section class="speed" aria-labelledby="speed-title">
  <div class="container speed__inner">
    <div class="speed__copy">
      <p class="eyebrow eyebrow--gold">{m.speed.eyebrow}</p>
      <h2 class="title" id="speed-title" data-reveal>{m.speed.title}</h2>
      <p class="lead" data-reveal style:--reveal-delay="80">{m.speed.body}</p>

      <dl class="speed__stats">
        {#each m.speed.stats as stat, index (index)}
          <div class="speed__stat" data-reveal style:--reveal-delay={120 + index * 90}>
            <dt>{stat.label}</dt>
            <dd>
              <span class="speed__value" data-count={stat.value}>{stat.value}</span><span class="speed__unit"
                >{stat.unit}</span
              >
            </dd>
          </div>
        {/each}
      </dl>
      <p class="speed__note" data-reveal>{m.speed.note}</p>
    </div>

    <div class="speed__visual" data-scale-box data-reveal style:--reveal-delay="120">
      <div class="speed__diagram" data-scale style:--mw-width="560px" data-speed-diagram aria-hidden="true">
        <svg class="speed__wires" viewBox="0 0 560 420" width="560" height="420">
          {#each WIRES as wire, index (index)}
            <path d={wire} class="speed__wire" style:--i={index} />
          {/each}
        </svg>
        {#each WIRES as wire, index (index)}
          <span class="speed__packet" style:--i={index} style:offset-path="path('{wire}')"></span>
        {/each}

        {#each FILES as file, index (index)}
          <div class="speed__term" style:--i={index} style:top="{40 + index * 110}px">
            <span class="speed__term-dots"><i></i><i></i><i></i></span>
            <code><span class="speed__prompt">&gt;</span> marxdown {file}</code>
          </div>
        {/each}

        <div class="speed__window">
          <div class="speed__tabs">
            {#each FILES as file, index (index)}
              <span class="speed__tab" style:--i={index}>{file}</span>
            {/each}
          </div>
          <div class="speed__body">
            <i style:width="62%"></i><i style:width="88%"></i><i style:width="74%"></i><i style:width="80%"></i><i
              style:width="46%"
            ></i>
          </div>
        </div>

        <div class="speed__tray">
          <span class="speed__tray-icon"><Mark size={14} /></span>
          <span>{m.speed.tray}</span>
          <span class="speed__tray-pulse"></span>
        </div>
      </div>
    </div>
  </div>
</section>
