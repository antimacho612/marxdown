<!--
  保存しても触っていないバイトが変わらないことを、バイト列で見せる（`client/landing/bytes.ts`）。
  1 文字だけ書き換えて保存し、変わるのがその 1 バイトだけであることを示す。
-->
<script lang="ts">
  import type { PageContext } from '../../context';
  import type { LandingData } from '../../server/landing';
  import Keys from '../Keys.svelte';

  const { ctx, data }: { ctx: PageContext; data: LandingData } = $props();
  const m = $derived(ctx.m);
  const t = $derived(m.bytes);
  const { lines, cells, target } = $derived(data.bytes);
</script>

<section class="bytes" aria-labelledby="bytes-title">
  <div class="container bytes__inner">
    <div class="bytes__copy">
      <p class="eyebrow eyebrow--gold">{t.eyebrow}</p>
      <h2 class="title" id="bytes-title" data-reveal>{t.title}</h2>
      <p class="lead" data-reveal style:--reveal-delay="80">{t.body}</p>
      <ul class="chips chips--check" data-reveal style:--reveal-delay="140">
        {#each t.chips as chip (chip)}<li>{chip}</li>{/each}
      </ul>
    </div>

    <div
      class="bytes__panel"
      data-bytes
      data-target-hex={target.hex}
      data-target-char={t.edit.to}
      data-reveal
      style:--reveal-delay="100"
    >
      <div class="bytes__file">
        <div class="bytes__file-bar">
          <span class="bytes__file-name">notes.md</span>
          <span class="bytes__badge bytes__badge--bom">UTF-8 BOM</span>
          <span class="bytes__badge bytes__badge--eol">CRLF</span>
          <span class="bytes__save" data-bytes-save><Keys keys="Ctrl+S" /></span>
        </div>
        <ol class="bytes__lines">
          {#each lines as line, index (index)}
            <li>
              {#if index === 0}<span class="bytes__mark bytes__mark--bom">BOM</span>{/if}
              {#if index === target.line}
                <span>{[...line].slice(0, target.column).join('')}</span><span class="bytes__target" data-bytes-char
                  >{t.edit.from}</span
                ><span>{[...line].slice(target.column + 1).join('')}</span>
              {:else}
                <span>{line}</span>
              {/if}
              <span class="bytes__mark bytes__mark--eol">CRLF</span>
            </li>
          {/each}
        </ol>
      </div>

      <div class="bytes__grid" aria-hidden="true">
        {#each cells as cell, index (index)}
          <span class="bytes__cell bytes__cell--{cell.kind}" style:--i={index} data-bytes-cell={cell.kind}>
            <span class="bytes__cell-face">{cell.hex}</span>
          </span>
        {/each}
      </div>

      <dl class="bytes__stats">
        <div>
          <dt>{t.changed}</dt>
          <dd><strong data-bytes-changed>0</strong> {t.unit}</dd>
        </div>
        <div>
          <dt>{t.total}</dt>
          <dd><strong>{cells.length}</strong> {t.unit}</dd>
        </div>
      </dl>
    </div>
  </div>
</section>
