<!--
  ファイルツリーのコンテキストメニュー（`explorer.copyTree`）。

  押されたディレクトリを対象に、ポインタの位置へ出す。
  `Esc` で閉じる・外側を押すと閉じるは `AppMenu.svelte` と同じ形である。
  移動キーを持たないのは項目が 1 つだからで、増えたときは AppMenu と同じ操作にする。
-->
<script lang="ts">
  import { onMount } from 'svelte';

  import { ja } from '@/i18n/ja';
  import { runCommand } from '@/lib/commands';

  interface Props {
    /** 対象のディレクトリ。 */
    path: string;
    /** 開く位置（ビューポート座標）。 */
    x: number;
    y: number;
    onclose: () => void;
  }

  const { path, x, y, onclose }: Props = $props();

  let panel: HTMLElement;
  let width = $state(0);
  let height = $state(0);

  // 画面の端では内側へ寄せる。はみ出した項目は押せない。
  // 寸法は枠線を含む `offset*` で測る。`client*` だと枠線のぶんだけ補正が足りない。
  const left = $derived(Math.max(0, Math.min(x, globalThis.innerWidth - width)));
  const top = $derived(Math.max(0, Math.min(y, globalThis.innerHeight - height)));

  onMount(() => {
    panel.querySelector('button')?.focus();

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && panel.contains(target)) return;
      onclose();
    };
    document.addEventListener('pointerdown', onPointerDown, { capture: true });
    return () => document.removeEventListener('pointerdown', onPointerDown, { capture: true });
  });

  function onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    // 検索パネルなど、グローバルに Escape を握っている機能へ渡さない。
    event.stopPropagation();
    event.preventDefault();
    onclose();
  }

  function activate(): void {
    // 先に閉じる。コピーの結果は通知バーに出るため、メニューが残っているとその上に重なる。
    onclose();
    runCommand('explorer.copyTree', path);
  }
</script>

<div
  class="mx-treemenu"
  role="menu"
  tabindex="-1"
  style:left="{left}px"
  style:top="{top}px"
  bind:this={panel}
  bind:offsetWidth={width}
  bind:offsetHeight={height}
  onkeydown={onKeydown}
>
  <button type="button" role="menuitem" tabindex="-1" class="mx-treemenu__item" onclick={activate}>
    {ja.tree.copyTree}
  </button>
</div>

<style>
  .mx-treemenu {
    position: fixed;
    z-index: 40;

    min-width: 14rem;
    padding: var(--mx-space-1) 0;
    border: 1px solid var(--mx-color-border);
    border-radius: var(--mx-radius);
    background: var(--mx-color-bg-subtle);
    box-shadow: var(--mx-shadow-1);
    font-size: var(--mx-font-size-ui);
  }

  .mx-treemenu:focus {
    outline: none;
  }

  .mx-treemenu__item {
    display: block;
    width: 100%;
    padding: var(--mx-space-2) var(--mx-space-3);
    border: none;
    background: none;
    color: var(--mx-color-fg);
    font: inherit;
    text-align: start;
    cursor: pointer;
  }

  .mx-treemenu__item:hover {
    background: var(--mx-color-bg-hover);
  }

  .mx-treemenu__item:focus-visible {
    outline: 2px solid var(--mx-color-accent);
    outline-offset: -2px;
  }
</style>
