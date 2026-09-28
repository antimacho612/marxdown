<!-- 一覧の絞り込み。対象は同じページの `[data-filter-item]` で、処理は `client/guide.ts` が持つ。 -->
<script lang="ts">
  import Icon from '../Icon.svelte';

  const { placeholder, empty }: { placeholder: string; empty: string } = $props();
</script>

<div class="filter" role="search">
  <Icon name="search" size={18} />
  <input type="search" {placeholder} aria-label={placeholder} autocomplete="off" spellcheck="false" data-filter />
  <output class="filter__count" data-filter-count></output>
</div>
<p class="filter__empty" data-filter-empty hidden>{empty}</p>
