<!--
  タブの右クリックメニュー（F-OPEN-06 / F-NAV-02）。
  遅延チャンクで、右クリックされるまでロードされない。

  並べるのは「そのタブ 1 枚に対する操作」だけである。
  対象は右クリックしたタブであり、表示中のタブとは限らない。
  アプリ全体に対する操作はハンバーガーメニュー（`features/menu`）にあり、ここには重ねない。

  キーボード操作はハンバーガーメニューに揃える。
  `Esc` で閉じてタブへ戻る / `↑↓` で移動 / `Home` `End` で端へ移動する。
-->
<script lang="ts">
  import { onMount, tick } from 'svelte';

  import { isSatellite } from '@/features/view';
  import { ja } from '@/i18n/ja';
  import { jaExplorer } from '@/i18n/ja-explorer';
  import { MAIN_WINDOW } from '@/platform';

  import { moveTabToSatellite } from '../new-window';
  import type { TabMenuProps } from '../tab-menu-props';
  import { closeTab, tabsStore } from '../tabs.svelte';
  import { moveTabToWindow } from './handoff';
  import { keepTab } from './temporary-tab.svelte';

  const { tabId, name, x, y, onclose }: TabMenuProps = $props();

  /** 画面の端から確保する余白（px）。右下で開いたときにメニューが切れないようにする。 */
  const EDGE_MARGIN = 8;

  let panel: HTMLElement;

  /**
   * 実際に置く位置。大きさを測るまでは決まらないため、決まるまでは描画しない。
   *
   * 押した位置にそのまま出してから位置を直すと、右下で開いたときに一度はみ出した状態が描画される。
   */
  let placed = $state<{ left: number; top: number } | null>(null);

  const items = [
    ...(tabsStore.tabs.find((tab) => tab.id === tabId)?.temporary
      ? [{ id: 'keep', label: jaExplorer.keepTab, run: () => keepTab(tabId) }]
      : []),
    // サテライトからは主ウィンドウへ戻せる（OQ-43）。ドラッグで戻す操作の、キーボードからの入口でもある。
    ...(isSatellite()
      ? [{ id: 'to-main', label: ja.menu.moveToMainWindow, run: () => void moveTabToWindow(tabId, MAIN_WINDOW) }]
      : []),
    { id: 'new-window', label: ja.menu.moveToNewWindow, run: () => void moveTabToSatellite(tabId) },
    { id: 'close', label: ja.tab.closeCurrent, run: () => void closeTab(tabId) },
  ];

  function buttons(): HTMLButtonElement[] {
    return [...panel.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
  }

  /** `step` だけ動かして循環させる。 */
  function move(step: number): void {
    const list = buttons();
    if (list.length === 0) return;
    const index = list.indexOf(document.activeElement as HTMLButtonElement);
    const next = (index + step + list.length) % list.length;
    list[next]?.focus();
  }

  function focusEdge(last: boolean): void {
    const list = buttons();
    (last ? list.at(-1) : list[0])?.focus();
  }

  onMount(async () => {
    // 画面からはみ出す分だけ戻す。
    // 測るのはマウント後の 1 回だけで、開いている間に大きさは変わらない。
    const box = panel.getBoundingClientRect();
    placed = {
      left: Math.max(EDGE_MARGIN, Math.min(x, globalThis.innerWidth - box.width - EDGE_MARGIN)),
      top: Math.max(EDGE_MARGIN, Math.min(y, globalThis.innerHeight - box.height - EDGE_MARGIN)),
    };
    // 位置が決まるまでは `visibility: hidden` で、その間の `focus()` は無視される。表示に切り替わってから移す。
    await tick();
    focusEdge(false);
  });

  function activate(run: () => void): void {
    // 先に閉じる。実行が非同期に終わるものでも、押した瞬間にメニューが消えるほうが操作を受け付けたことが伝わる（`AppMenu.svelte` と同じ判断）。
    onclose(false);
    run();
  }

  function onKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'Escape': {
        // 検索パネルなど、グローバルに Escape を握っている機能へ渡さない。
        event.stopPropagation();
        onclose();
        break;
      }
      case 'ArrowDown': {
        move(1);
        break;
      }
      case 'ArrowUp': {
        move(-1);
        break;
      }
      case 'Home': {
        focusEdge(false);
        break;
      }
      case 'End': {
        focusEdge(true);
        break;
      }
      default: {
        return;
      }
    }
    event.preventDefault();
  }

  /** 外側を押したら閉じる。押した先へ操作が移るため、タブへフォーカスは戻さない。 */
  function onOutside(event: PointerEvent): void {
    if (event.target instanceof Node && panel.contains(event.target)) return;
    onclose(false);
  }
</script>

<svelte:window onpointerdown={onOutside} onresize={() => onclose(false)} />

<!--
  `data-tauri-drag-region="false"` を置く（`app/MenuButton.svelte` と同じ事情）。
  タイトルバー全体がドラッグ領域であり、これが無いとメニューの余白をドラッグしたときにウィンドウが動く。
-->
<div
  class="mx-tabmenu"
  role="menu"
  aria-label={ja.tab.menu(name)}
  tabindex="-1"
  data-tauri-drag-region="false"
  style:left="{placed?.left ?? x}px"
  style:top="{placed?.top ?? y}px"
  style:visibility={placed ? 'visible' : 'hidden'}
  bind:this={panel}
  onkeydown={onKeydown}
>
  {#each items as item (item.id)}
    <button type="button" class="mx-tabmenu__item" role="menuitem" onclick={() => activate(item.run)}>
      {item.label}
    </button>
  {/each}
</div>

<style>
  /* 見た目はハンバーガーメニュー（`features/menu/lazy/AppMenu.svelte`）に揃える。同じ役割のものが 2 通りの見え方をしないようにする。 */
  .mx-tabmenu {
    position: fixed;
    z-index: 40;
    min-width: 12rem;
    padding: var(--mx-space-1) 0;
    border: 1px solid var(--mx-color-border);
    border-radius: var(--mx-radius);
    background: var(--mx-color-bg-subtle);
    box-shadow: var(--mx-shadow-1);
    font-size: var(--mx-font-size-ui);
  }

  .mx-tabmenu:focus {
    outline: none;
  }

  .mx-tabmenu__item {
    display: block;
    width: 100%;
    padding: var(--mx-space-1) var(--mx-space-3);
    border: none;
    background: none;
    color: var(--mx-color-fg);
    font: inherit;
    text-align: start;
    white-space: nowrap;
    cursor: default;
  }

  .mx-tabmenu__item:hover {
    background: var(--mx-color-bg-hover);
  }

  .mx-tabmenu__item:focus-visible {
    outline: 2px solid var(--mx-color-accent);
    outline-offset: -2px;
  }
</style>
