<!--
  ハンバーガーメニューの中身（03.ux-spec/01-screen-layout.md §3「初学者の逃げ道」）。
  遅延チャンクで、ボタンが押されるまでロードされない。
  何を並べるかは `items.ts` が決め、ここは受け取った配列を描くだけである。

  キーボードだけで完結させる。
  `Esc` で閉じてボタンへ戻る / `↑↓` で移動 / `Home` `End` で端へ移動する。
  `Tab` は外へ出さずに循環させる（WAI-ARIA は `Tab` で閉じることを勧めるが、逃げ道を `Esc` の 1 本に定めるほうが初学者の逃げ道という役割に合う）。
-->
<script lang="ts">
  import { onMount } from 'svelte';

  import type { AppMenuProps } from '../props';
  import { buildMenu, type MenuAction } from './items';

  const { onclose, focusLast }: AppMenuProps = $props();

  /** 見出しと `role="group"` を結ぶための一意な接頭辞。 */
  const uid = $props.id();

  const groups = $derived(buildMenu());

  let panel: HTMLElement;

  /** いま並んでいる項目。開いている最中に増減しないので、都度引き直すだけで足りる。 */
  function items(): HTMLButtonElement[] {
    return [...panel.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
  }

  /** `step` だけ動かして循環させる。`from` が -1 のときは先頭 / 末尾から始まる。 */
  function move(step: number): void {
    const list = items();
    if (list.length === 0) return;
    const index = list.indexOf(document.activeElement as HTMLButtonElement);
    const next = (index + step + list.length) % list.length;
    list[next]?.focus();
  }

  function focusEdge(last: boolean): void {
    const list = items();
    (last ? list.at(-1) : list[0])?.focus();
  }

  onMount(() => {
    focusEdge(focusLast);
  });

  function activate(item: MenuAction): void {
    // 先に閉じる。実行が非同期に終わるもの（ダイアログ・再読み込み）でも、
    // 押した瞬間にメニューが消えるほうが「効いた」ことが伝わる（NoticeBar と同じ判断）。
    onclose(false);
    item.run();
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
      case 'Tab': {
        // 閉じ込める。外へ出す実装だと、フォーカスが本文へ落ちたのに
        // メニューが開いたまま残る状態が作れてしまう。
        move(event.shiftKey ? -1 : 1);
        break;
      }
      default: {
        return;
      }
    }
    event.preventDefault();
  }

  /**
   * 外側を押したら閉じる。
   *
   * 「外側」は**パネルの親**を基準にする。親にはメニューボタン自身が入っていて、
   * ボタンを押したときにここで閉じてしまうと、直後のクリックで開き直されて
   * 「1 回押しただけで閉じない」ように見える。トグルはボタンに任せる。
   *
   * `click` ではなく `pointerdown` なのは、押した時点で閉じてほしいため。
   */
  onMount(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (panel.parentElement?.contains(target)) return;
      onclose(false);
    };
    document.addEventListener('pointerdown', onPointerDown, { capture: true });
    return () => document.removeEventListener('pointerdown', onPointerDown, { capture: true });
  });
</script>

<div class="mx-menu" role="menu" tabindex="-1" bind:this={panel} onkeydown={onKeydown}>
  {#each groups as group (group.id)}
    <div class="mx-menu__group" role="group" aria-labelledby={group.label ? `${uid}-${group.id}` : undefined}>
      {#if group.label}
        <p class="mx-menu__heading" id="{uid}-{group.id}">{group.label}</p>
      {/if}

      {#each group.items as item (item.id)}
        <button
          type="button"
          role="menuitem"
          tabindex="-1"
          class="mx-menu__item"
          class:mx-menu__item--nested={group.label !== undefined}
          title={item.title}
          onclick={() => activate(item)}
        >
          <span class="mx-menu__label">{item.label}</span>
          {#if item.detail}<span class="mx-menu__detail">{item.detail}</span>{/if}
          {#if item.shortcut}<kbd>{item.shortcut}</kbd>{/if}
        </button>
      {/each}

      <!-- 押せない項目を置く代わりの 1 行。`menuitem` ではないのでフォーカスは来ない。 -->
      {#if group.items.length === 0 && group.empty}
        <p class="mx-menu__empty">{group.empty}</p>
      {/if}
    </div>
  {/each}
</div>

<style>
  /*
   * タイトルバー左端のボタンからぶら下がる。位置の基準は `.mx-menubutton`。
   *
   * 幅は内容で決めず固定に近い値にしてある。開くたびに幅が変わると、
   * 同じ項目が毎回違う場所に来て、位置で覚えられない。
   */
  .mx-menu {
    position: absolute;
    top: 100%;
    inset-inline-start: var(--mx-space-1);
    z-index: 40;

    width: 22rem;
    max-width: calc(100vw - 2 * var(--mx-space-4));
    max-height: calc(100vh - var(--mx-titlebar-height) - var(--mx-space-4));
    overflow-y: auto;

    padding: var(--mx-space-1) 0;
    border: 1px solid var(--mx-color-border);
    border-radius: var(--mx-radius);
    background: var(--mx-color-bg-subtle);
    box-shadow: var(--mx-shadow-1);
    font-size: var(--mx-font-size-ui);
  }

  .mx-menu:focus {
    outline: none;
  }

  /* 区切り線は `<hr>` を挟まず、隣り合ったグループの境界として引く。 */
  .mx-menu__group + .mx-menu__group {
    border-top: 1px solid var(--mx-color-border-subtle);
    margin-top: var(--mx-space-1);
    padding-top: var(--mx-space-1);
  }

  .mx-menu__heading {
    margin: var(--mx-space-1) 0;
    padding-inline: var(--mx-space-3);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--mx-color-fg-subtle);
  }

  .mx-menu__item {
    display: flex;
    align-items: baseline;
    gap: var(--mx-space-3);
    width: 100%;
    padding: var(--mx-space-1) var(--mx-space-3);
    border: none;
    background: none;
    color: var(--mx-color-fg);
    font: inherit;
    font-size: var(--mx-font-size-ui);
    text-align: start;
    cursor: default;
  }

  /* 見出しのあるグループの中は 1 段下げる。見出しとの主従を字下げで表す。 */
  .mx-menu__item--nested {
    padding-inline-start: var(--mx-space-6);
  }

  .mx-menu__label {
    max-width: 70%;
    flex: none;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* ディレクトリは補助情報。長いパスは頭を削って末尾（＝現在地）を残す（Welcome と同じ）。 */
  .mx-menu__detail {
    flex: 1;
    min-width: 0;
    color: var(--mx-color-fg-subtle);
    font-size: 11px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    direction: rtl;
    text-align: start;
  }

  /* 補足が無い項目でも、キーは右端に揃える。 */
  .mx-menu__item > kbd {
    margin-inline-start: auto;
    flex: none;
    color: var(--mx-color-fg-subtle);
  }

  .mx-menu__item:hover {
    background: var(--mx-color-bg-hover);
  }

  /*
   * `:focus` であって `:focus-visible` ではない。
   *
   * 項目は `tabindex="-1"` で、フォーカスが来るのはキーボード操作か
   * スクリプトからの `focus()` に限られる。`:focus-visible` にすると
   * `↓` で移動しているのに何も光らない状態が起きる。
   */
  .mx-menu__item:focus {
    outline: none;
    background: var(--mx-color-bg-hover);
    box-shadow: inset 2px 0 0 var(--mx-color-accent);
  }

  .mx-menu__empty {
    margin: 0;
    padding: var(--mx-space-1) var(--mx-space-6);
    color: var(--mx-color-fg-subtle);
  }
</style>
