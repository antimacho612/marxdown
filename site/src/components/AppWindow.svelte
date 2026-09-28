<!--
  アプリのウィンドウの見本。画像ではなく HTML で組み、アプリの `tokens.css` / `preview.css` で塗る。
  状態（表示モード・開いているタブ・エクスプローラー）は `data-*` 属性で持ち、`client/` のスクリプトが書き換える。
  中身は本文と同じ内容の繰り返しになるため、支援技術からは隠す。
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  import type { PageContext } from '../context';
  import type { TreeItem, WindowDoc, WindowMode } from '../lib/window';

  interface Props {
    ctx: PageContext;
    docs: WindowDoc[];
    /** 最初から開いているタブ。並びは `docs` と同じ。 */
    open?: string[];
    active?: string;
    mode?: WindowMode;
    tree?: TreeItem[];
    /** 論理上の大きさ。表示する幅に合わせて `zoom` で縮める（`client/scale.ts`）。 */
    width?: number;
    height?: number;
    /** 幅を詰めてよい下限。これより狭い場所では縮めて表示する。 */
    scaleMin?: number;
    class?: string;
    id?: string;
    overlay?: Snippet;
  }

  const {
    ctx,
    docs,
    open = docs.map((doc) => doc.id),
    active = open[0],
    mode = 'preview',
    tree,
    width = 1040,
    height = 640,
    scaleMin = Math.round(width * 0.66),
    class: className = '',
    id,
    overlay,
  }: Props = $props();

  const w = $derived(ctx.m.window);
  const activeDoc = $derived(docs.find((doc) => doc.id === active) ?? docs[0]);
</script>

<div
  class="mw {className}"
  {id}
  data-mode={mode}
  data-explorer={tree ? 'hidden' : undefined}
  data-active={active}
  data-scale
  data-scale-min={scaleMin}
  style:--mw-width="{width}px"
  style:--mw-height="{height}px"
  aria-hidden="true"
  inert
>
  <div class="mw__titlebar">
    <span class="mw__menu">
      <svg viewBox="0 0 16 16" width="16" height="16"><path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" /></svg>
    </span>
    <div class="mw__tabs">
      {#each docs as doc (doc.id)}
        <span
          class="mw__tab"
          data-tab={doc.id}
          data-current={doc.id === active ? '' : undefined}
          hidden={!open.includes(doc.id)}
        >
          <span class="mw__tab-name">{doc.name}</span>
          <svg class="mw__tab-close" viewBox="0 0 16 16" width="12" height="12"><path d="M4 4l8 8M12 4l-8 8" /></svg>
        </span>
      {/each}
    </div>
    <span class="mw__controls">
      <svg viewBox="0 0 16 16" width="10" height="10"><path d="M2 8h12" /></svg>
      <svg viewBox="0 0 16 16" width="10" height="10"><path d="M2.5 2.5h11v11h-11z" /></svg>
      <svg viewBox="0 0 16 16" width="10" height="10"><path d="M2.5 2.5l11 11M13.5 2.5l-11 11" /></svg>
    </span>
  </div>

  <div class="mw__main">
    {#if tree}
      <aside class="mw__explorer">
        <div class="mw__pane-title">{w.explorer}</div>
        <ul class="mw__tree">
          {#each tree as item (item.path)}
            <li
              class="mw__tree-item"
              data-path={item.path}
              data-folder={item.folder ? '' : undefined}
              style:--depth={item.depth}
            >
              {#if item.folder}
                <svg class="mw__tree-chevron" viewBox="0 0 16 16" width="12" height="12"><path d="M6 4l4 4-4 4" /></svg>
              {:else}
                <svg class="mw__tree-file" viewBox="0 0 16 16" width="12" height="12"
                  ><path d="M4 2h5l3 3v9H4zM9 2v3h3" /></svg
                >
              {/if}
              <span>{item.name}</span>
            </li>
          {/each}
        </ul>
      </aside>
    {/if}

    <div class="mw__editor">
      {#each docs as doc (doc.id)}
        {#if doc.lines}
          <div class="mw__code" data-doc={doc.id} hidden={doc.id !== active}>
            {#each doc.lines as line, index (index)}
              <div class="mw__line">
                <span class="mw__ln">{index + 1}</span><span class="mw__lc">{@html line}</span>
              </div>
            {/each}
          </div>
        {/if}
      {/each}
    </div>

    <div class="mw__previews">
      {#each docs as doc (doc.id)}
        <div
          class="mx-preview mw__preview"
          data-doc={doc.id}
          data-mx-table-style="lines"
          data-chars-label={w.chars(doc.chars)}
          data-minutes-label={w.minutes(doc.minutes)}
          hidden={doc.id !== active}
        >
          <div class="mx-content">{@html doc.html}</div>
        </div>
      {/each}
    </div>

    {@render overlay?.()}
  </div>

  <div class="mw__status">
    <span data-status-mode>{w.mode[mode]}</span>
    <span>{w.encoding}</span>
    <span>{w.eol}</span>
    <span data-status-chars>{w.chars(activeDoc?.chars ?? 0)}</span>
    <span data-status-minutes>{w.minutes(activeDoc?.minutes ?? 1)}</span>
    <span class="mw__status-spacer"></span>
    <span>100%</span>
  </div>
</div>
