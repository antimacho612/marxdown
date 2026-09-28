<!--
  ガイドの横断検索。見た目はアプリのコマンドパレットに合わせてある。
  索引（`search/<言語>.json`）は開いたときに初めて読み込む（`client/palette.ts`）。
-->
<script lang="ts">
  import type { PageContext } from '../context';
  import Icon from './Icon.svelte';

  const { ctx }: { ctx: PageContext } = $props();
  const m = $derived(ctx.m);
</script>

<dialog
  class="palette"
  aria-label={m.palette.open}
  data-palette
  data-index={ctx.asset(`search/${ctx.route.locale}.json`)}
  data-empty={m.palette.empty}
  data-kinds={JSON.stringify(m.palette.kinds)}
>
  <div class="palette__field">
    <Icon name="search" />
    <input
      type="search"
      placeholder={m.palette.placeholder}
      aria-label={m.palette.placeholder}
      aria-controls="palette-results"
      aria-autocomplete="list"
      role="combobox"
      aria-expanded="true"
      autocomplete="off"
      spellcheck="false"
      data-palette-input
    />
  </div>
  <ul class="palette__results" id="palette-results" role="listbox" data-palette-results></ul>
  <div class="palette__hint">{m.palette.hint}</div>
</dialog>
