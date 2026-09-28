<!--
  ターミナルの見本（Windows Terminal に似せた外観）。
  スクリプトが無い環境や動きを減らす設定では、打ち終えた状態のまま表示される。
-->
<script lang="ts">
  interface Props {
    title: string;
    prompt: string;
    /** 実行済みのコマンド。 */
    commands: string[];
    class?: string;
    id?: string;
  }

  const { title, prompt, commands, class: className = '', id }: Props = $props();
</script>

<div class="term {className}" {id} data-terminal data-prompt={prompt} aria-hidden="true">
  <div class="term__bar">
    <span class="term__tab">
      <svg viewBox="0 0 16 16" width="14" height="14"
        ><rect x="1.5" y="2.5" width="13" height="11" rx="2" /><path d="M4.5 6l2 2-2 2M8 10.5h3.5" /></svg
      >
      {title}
    </span>
    <span class="term__controls">
      <svg viewBox="0 0 16 16" width="10" height="10"><path d="M2 8h12" /></svg>
      <svg viewBox="0 0 16 16" width="10" height="10"><path d="M2.5 2.5h11v11h-11z" /></svg>
      <svg viewBox="0 0 16 16" width="10" height="10"><path d="M2.5 2.5l11 11M13.5 2.5l-11 11" /></svg>
    </span>
  </div>
  <div class="term__body" data-term-body>
    {#each commands as command, index (index)}
      <div class="term__line"><span class="term__prompt">{prompt}</span> <span class="term__cmd">{command}</span></div>
    {/each}
    <div class="term__line" data-term-current>
      <span class="term__prompt">{prompt}</span> <span class="term__cmd" data-term-input></span><span
        class="term__cursor"
      ></span>
    </div>
  </div>
</div>
