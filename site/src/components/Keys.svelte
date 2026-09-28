<!-- `Ctrl+Shift+P` の形の文字列を、キーキャップの並びにする。 -->
<script lang="ts">
  const { keys }: { keys: string } = $props();

  // `Ctrl++` のように `+` 自身がキーのときに備え、区切りの `+` だけで分ける。
  const parts = $derived(keys.split(/\+(?=.)/));
</script>

<span class="keys">
  {#each parts as part, index (index)}
    {#if index > 0}<span aria-hidden="true">+</span>{/if}<kbd>{part}</kbd>
  {/each}
</span>
