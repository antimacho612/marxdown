<!-- スクロールに合わせて、文が前から順に明るくなる（`client/landing/scenes.ts`）。 -->
<script lang="ts">
  import type { PageContext } from '../../context';
  import { splitEmphasis } from '../../lib/emphasis';

  const { ctx }: { ctx: PageContext } = $props();
  const m = $derived(ctx.m);

  /** 明るくする単位。日本語は文節の区切りを持たないため、読点・句点・括弧の後ろで切る。 */
  function chunks(text: string): string[] {
    const pattern = ctx.route.locale === 'ja' ? /(?<=[、。」])/ : /(?<=\s)/;
    return text.split(pattern).filter((chunk) => chunk !== '');
  }
</script>

<section class="statement" aria-labelledby="statement-title">
  <div class="container">
    <p class="eyebrow eyebrow--rose" id="statement-title">{m.statement.eyebrow}</p>
    <p class="statement__text" data-statement>
      {#each m.statement.lines as line, index (index)}
        <span class="statement__line">
          {#each splitEmphasis(line) as segment, j (j)}
            {#each chunks(segment.text) as chunk, k (k)}
              <span class="statement__chunk" class:statement__em={segment.em}>{chunk}</span>
            {/each}
          {/each}
        </span>
      {/each}
    </p>
    <p class="statement__closing" data-reveal>
      {m.statement.closing}
    </p>
  </div>
</section>
