<!--
  ハンバーガーメニューの中身（03.ux-spec/01-screen-layout.md §3「初学者の逃げ道」）。
  遅延チャンクで、ボタンが押されるまでロードされない。
  何を並べるかは `items.ts` が決め、ここは受け取った配列を描くだけである。

  キーボードだけで完結させる。
  `Esc` で閉じてボタンへ戻る / `↑↓` で移動 / `Home` `End` で端へ移動する。
  サブメニューは `→` `Enter` で開き、`←` `Esc` で親の行へ戻る。倍率の行の中は `←→` で移動する。
  `Tab` は外へ出さずに循環させる（WAI-ARIA は `Tab` で閉じることを勧めるが、逃げ道を `Esc` の 1 本に定めるほうが初学者の逃げ道という役割に合う）。
-->
<script lang="ts">
  import { onMount, tick } from 'svelte';

  import { splitShortcutKeys } from '@/lib/shortcuts';

  import type { AppMenuProps } from '../props';
  import { buildMenu, type MenuAction, type MenuSubmenu } from './items';

  const { onclose, focusLast }: AppMenuProps = $props();

  /** ホバーでサブメニューを開くまでの時間。通過しただけの行で開かないようにする。 */
  const HOVER_OPEN_MS = 150;
  /**
   * ホバーが別の行へ移ってからサブメニューを閉じるまでの時間。
   *
   * 親の行からサブメニューへ斜めにポインターを動かすと、途中で下の行を通過する。
   * その間に閉じないよう、開くときより長く待つ。
   */
  const HOVER_CLOSE_MS = 300;
  /** 画面の端から確保する余白（px）。 */
  const EDGE_MARGIN = 8;

  const groups = $derived(buildMenu());

  let panel: HTMLElement;
  let subPanel = $state<HTMLElement | null>(null);

  /** 開いているサブメニューの id。同時に開くのは 1 つだけである。 */
  let openSub = $state<string | null>(null);
  /** サブメニューの位置。測るまでは決まらないため、決まるまでは表示しない（`workspace/lazy/TabMenu.svelte` と同じ）。 */
  let subPlaced = $state<{ left: number; top: number } | null>(null);

  let openTimer: ReturnType<typeof setTimeout> | undefined;
  let closeTimer: ReturnType<typeof setTimeout> | undefined;

  function clearTimers(): void {
    clearTimeout(openTimer);
    clearTimeout(closeTimer);
  }

  /** `menu` の直下にある行。倍率の行の 2 つ目以降のボタンは、行の先頭で代表させるため含めない。 */
  function rowsOf(menu: HTMLElement): HTMLElement[] {
    return [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')].filter(
      (el) => el.closest('[role="menu"]') === menu && !el.hasAttribute('data-mx-inline'),
    );
  }

  /** いまフォーカスがあるメニュー。サブメニューの中ならサブメニューを返す。 */
  function currentMenu(): HTMLElement {
    return (document.activeElement?.closest<HTMLElement>('[role="menu"]') ?? panel) as HTMLElement;
  }

  /** 倍率の行の中のボタンなら、その行の全ボタンを返す。 */
  function stepsOf(el: Element | null): HTMLElement[] {
    const row = el?.closest('.mx-menu__stepper');
    return row ? [...row.querySelectorAll<HTMLElement>('[role="menuitem"]')] : [];
  }

  /** `step` だけ動かして循環させる。 */
  function move(step: number): void {
    const menu = currentMenu();
    const list = rowsOf(menu);
    if (list.length === 0) return;
    const active = document.activeElement as HTMLElement | null;
    // 倍率の行の中にいるときは、行の先頭にいるものとして数える。
    const index = list.indexOf(stepsOf(active)[0] ?? (active as HTMLElement));
    const next = (index + step + list.length) % list.length;
    list[next]?.focus();
  }

  function focusEdge(last: boolean, menu: HTMLElement = currentMenu()): void {
    const list = rowsOf(menu);
    (last ? list.at(-1) : list[0])?.focus();
  }

  onMount(() => {
    focusEdge(focusLast, panel);
    return clearTimers;
  });

  function triggerOf(id: string): HTMLElement | null {
    return panel.querySelector<HTMLElement>(`[data-mx-submenu="${CSS.escape(id)}"]`);
  }

  /**
   * サブメニューを開く。`focusFirst` はキーボードで開いたときだけ true にする。
   *
   * 位置は親メニューの右隣。右に入らないときは左隣に出す。
   * 親メニューは `overflow-y: auto` であり、`position: absolute` だと切り取られるため `position: fixed` で置く。
   */
  async function openSubmenu(id: string, focusFirst: boolean): Promise<void> {
    clearTimers();
    if (openSub !== id) {
      openSub = id;
      subPlaced = null;
      await tick();
      const trigger = triggerOf(id);
      if (!trigger || !subPanel) return;

      const parent = panel.getBoundingClientRect();
      const row = trigger.getBoundingClientRect();
      const box = subPanel.getBoundingClientRect();
      const fitsRight = parent.right + box.width <= globalThis.innerWidth - EDGE_MARGIN;
      const left = fitsRight ? parent.right : Math.max(EDGE_MARGIN, parent.left - box.width);
      // 1 行目の項目が親の行と同じ高さに来るよう、パネルの上余白ぶん上げる。
      const padding = (subPanel.firstElementChild?.getBoundingClientRect().top ?? box.top) - box.top;
      const top = Math.max(EDGE_MARGIN, Math.min(row.top - padding, globalThis.innerHeight - box.height - EDGE_MARGIN));
      subPlaced = { left, top };
      // `visibility: hidden` の間の `focus()` は無視される。表示に切り替わってから移す。
      await tick();
    }
    if (focusFirst && subPanel) {
      const first = rowsOf(subPanel)[0];
      // 履歴が空のときは押せる項目が無い。パネル自体に置き、`←` `Esc` を受けられるようにする。
      (first ?? subPanel).focus();
    }
  }

  /** サブメニューを閉じる。中にフォーカスがあった場合は親の行へ戻す（`<body>` へ落とさない）。 */
  function closeSubmenu(refocus = false): void {
    clearTimers();
    if (openSub === null) return;
    const id = openSub;
    const hadFocus = subPanel?.contains(document.activeElement) ?? false;
    openSub = null;
    subPlaced = null;
    if (refocus || hadFocus) triggerOf(id)?.focus();
  }

  /** 親メニューの行にポインターが入った。`id` はサブメニューを持つ行ならその id。 */
  function hover(id: string | null): void {
    clearTimeout(openTimer);
    if (id !== null && id === openSub) {
      clearTimeout(closeTimer);
      return;
    }
    if (id !== null) {
      openTimer = setTimeout(() => void openSubmenu(id, false), HOVER_OPEN_MS);
    }
    if (openSub !== null) {
      clearTimeout(closeTimer);
      closeTimer = setTimeout(() => {
        closeSubmenu();
      }, HOVER_CLOSE_MS);
    }
  }

  function activate(item: MenuAction): void {
    // 先に閉じる。実行が非同期に終わるもの（ダイアログ・再読み込み）でも、押した瞬間にメニューが消えるほうが操作を受け付けたことが伝わる（NoticeBar と同じ判断）。
    onclose(false);
    item.run();
  }

  /** 倍率の行のボタン。閉じずに実行する。端に達している側は何もしない。 */
  function step(item: MenuAction, disabled: boolean): void {
    if (!disabled) item.run();
  }

  function onSubmenuClick(event: MouseEvent, item: MenuSubmenu): void {
    // `Enter` / `Space` で押されたクリックは `detail` が 0 になる。キーボードのときだけ中へフォーカスを移す。
    void openSubmenu(item.id, event.detail === 0);
  }

  function onKeydown(event: KeyboardEvent): void {
    const active = document.activeElement as HTMLElement | null;
    const inSub = subPanel?.contains(active) ?? false;
    const steps = stepsOf(active);

    switch (event.key) {
      case 'Escape': {
        // 検索パネルなど、グローバルに Escape を処理している機能へ渡さない。
        event.stopPropagation();
        if (inSub) closeSubmenu(true);
        else onclose();
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
      case 'ArrowRight': {
        const submenu = active?.dataset.mxSubmenu;
        if (submenu !== undefined) {
          void openSubmenu(submenu, true);
        } else if (steps.length > 0) {
          steps[Math.min(steps.indexOf(active as HTMLElement) + 1, steps.length - 1)]?.focus();
        }
        break;
      }
      case 'ArrowLeft': {
        if (steps.length > 0 && steps.indexOf(active as HTMLElement) > 0) {
          steps[steps.indexOf(active as HTMLElement) - 1]?.focus();
        } else if (inSub) {
          closeSubmenu(true);
        }
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
        // 閉じ込める。外へ出す実装だと、フォーカスが本文へ移ったのにメニューが開いたまま残る状態が作れてしまう。
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
   * 外側の判定はパネルの親要素を基準にする。
   * 親にはメニューボタン自身が含まれており、ボタンを押したときにここで閉じると、直後のクリックで開き直されて閉じないように見える。
   * トグルの処理はボタン側に任せる。
   * サブメニューはパネルの子要素として描くため、この判定の内側に入る。
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

  function hint(item: MenuAction): string {
    return item.shortcut === undefined ? item.label : `${item.label} (${item.shortcut})`;
  }
</script>

<svelte:window onresize={() => closeSubmenu()} />

{#snippet action(item: MenuAction, onpointerenter?: () => void)}
  <button
    type="button"
    role="menuitem"
    tabindex="-1"
    class="mx-menu__item"
    title={item.title}
    onclick={() => activate(item)}
    {onpointerenter}
  >
    <span class="mx-menu__label">{item.label}</span>
    <!--
      容器と `<bdi>` を分ける。
      `direction: rtl`（先頭を省略するため）と `dir="ltr"` を同じ要素に置くと、著者スタイルの `direction` が優先されて `<bdi>` の分離が RTL 方向で解決され、結局パスが並べ替わる（`workspace/Welcome.svelte` と同じ形）。
    -->
    {#if item.detail}<span class="mx-menu__detail"><bdi dir="ltr">{item.detail}</bdi></span>{/if}
    {#if item.shortcut}
      <span class="mx-menu__shortcut">
        {#each splitShortcutKeys(item.shortcut) as key (key)}<kbd>{key}</kbd>{/each}
      </span>
    {/if}
  </button>
{/snippet}

<!-- 親メニューがスクロールされるとサブメニューの位置がずれるため閉じる。 -->
<div class="mx-menu" role="menu" tabindex="-1" bind:this={panel} onkeydown={onKeydown} onscroll={() => closeSubmenu()}>
  {#each groups as group (group.id)}
    <div class="mx-menu__group" role="group">
      {#each group.items as item (item.id)}
        {#if item.kind === 'action'}
          {@render action(item, () => hover(null))}
        {:else if item.kind === 'submenu'}
          <button
            type="button"
            role="menuitem"
            tabindex="-1"
            class="mx-menu__item"
            aria-haspopup="menu"
            aria-expanded={openSub === item.id}
            data-mx-submenu={item.id}
            onclick={(event) => onSubmenuClick(event, item)}
            onpointerenter={() => hover(item.id)}
            onpointerleave={() => clearTimeout(openTimer)}
          >
            <span class="mx-menu__label">{item.label}</span>
            <svg
              class="mx-menu__chevron"
              viewBox="0 0 16 16"
              width="12"
              height="12"
              aria-hidden="true"
              focusable="false"
            >
              <path
                d="M6 3.5 10.5 8 6 12.5"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
              />
            </svg>
          </button>

          {#if openSub === item.id}
            <div
              class="mx-menu mx-menu--sub"
              role="menu"
              aria-label={item.label}
              tabindex="-1"
              bind:this={subPanel}
              style:left="{subPlaced?.left ?? 0}px"
              style:top="{subPlaced?.top ?? 0}px"
              style:visibility={subPlaced ? 'visible' : 'hidden'}
              onpointerenter={() => clearTimeout(closeTimer)}
            >
              {#each item.items as sub (sub.id)}
                {@render action(sub)}
              {/each}
              <!-- 押せない項目を置く代わりの 1 行。`menuitem` ではないのでフォーカスは来ない。 -->
              {#if item.items.length === 0 && item.empty}
                <p class="mx-menu__empty">{item.empty}</p>
              {/if}
            </div>
          {/if}
        {:else}
          <!--
            1 行に 3 つのボタンを置く。`↑↓` では先頭のボタンだけを行として扱い、行の中は `←→` で移動する。
            ラベルは視覚上の見出しで、読み上げは `role="group"` の名前が担う。
          -->
          <div
            class="mx-menu__item mx-menu__stepper"
            role="group"
            aria-label={item.label}
            onpointerenter={() => hover(null)}
          >
            <span class="mx-menu__label" aria-hidden="true">{item.label}</span>
            <span class="mx-menu__steps">
              <button
                type="button"
                role="menuitem"
                tabindex="-1"
                class="mx-menu__step"
                aria-label={item.decrease.label}
                title={hint(item.decrease)}
                aria-disabled={item.atMin}
                onclick={() => step(item.decrease, item.atMin)}>−</button
              >
              <button
                type="button"
                role="menuitem"
                tabindex="-1"
                class="mx-menu__step mx-menu__step--value"
                aria-label="{item.value} {item.reset.label}"
                title={hint(item.reset)}
                data-mx-inline
                onclick={() => step(item.reset, false)}>{item.value}</button
              >
              <button
                type="button"
                role="menuitem"
                tabindex="-1"
                class="mx-menu__step"
                aria-label={item.increase.label}
                title={hint(item.increase)}
                aria-disabled={item.atMax}
                data-mx-inline
                onclick={() => step(item.increase, item.atMax)}>+</button
              >
            </span>
          </div>
        {/if}
      {/each}
    </div>
  {/each}
</div>

<style>
  /*
   * タイトルバー左端のボタンの下に表示する。位置の基準は `.mx-menubutton`。
   *
   * 幅は内容で決めず固定に近い値にしてある。開くたびに幅が変わると、同じ項目が毎回違う場所に来て、位置で覚えられない。
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

  /*
   * 位置は `openSubmenu` が決めて `left` / `top` に書く。
   * 幅は親と違って内容に合わせる。中身は開くたびに同じなので、位置で覚える妨げにならない。
   */
  .mx-menu--sub {
    position: fixed;
    inset-inline-start: auto;
    z-index: 41;
    width: max-content;
    min-width: 12rem;
    max-width: min(22rem, calc(100vw - 16px));
    max-height: calc(100vh - 16px);
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

  .mx-menu__item {
    display: flex;
    align-items: center;
    gap: var(--mx-space-3);
    width: 100%;
    /* キーの表示（`<kbd>`）がある行とない行で高さが揃うよう、`<kbd>` を含む行の高さに合わせる。 */
    min-height: 1.875rem;
    padding: var(--mx-space-1) var(--mx-space-3);
    border: none;
    background: none;
    color: var(--mx-color-fg);
    font: inherit;
    font-size: var(--mx-font-size-ui);
    text-align: start;
    cursor: default;
  }

  .mx-menu__label {
    max-width: 70%;
    flex: none;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* ディレクトリは補助情報。長いパスは先頭を省略して末尾（＝現在地）を残す（Welcome と同じ）。 */
  .mx-menu__detail {
    flex: 1;
    min-width: 0;
    color: var(--mx-color-fg-subtle);
    font-size: var(--mx-font-size-ui-sm);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    direction: rtl;
    text-align: start;
  }

  /* 補足が無い項目でも、キーは右端に揃える。 */
  .mx-menu__shortcut {
    display: inline-flex;
    gap: var(--mx-space-1);
    margin-inline-start: auto;
    flex: none;
    color: var(--mx-color-fg-subtle);
  }

  .mx-menu__chevron {
    margin-inline-start: auto;
    flex: none;
    color: var(--mx-color-fg-subtle);
  }

  button.mx-menu__item:hover,
  .mx-menu__item[aria-expanded='true'] {
    background: var(--mx-color-bg-hover);
  }

  button.mx-menu__item:active {
    background: var(--mx-color-bg-inset);
  }

  /* ホバー中の面（`bg-hover`）では subtle が 4.5:1 に届かない。1 段上げる。 */
  :is(button.mx-menu__item:hover, .mx-menu__item[aria-expanded='true'])
    :is(.mx-menu__detail, .mx-menu__shortcut, .mx-menu__chevron) {
    color: var(--mx-color-fg-muted);
  }

  /*
   * `:focus` であって `:focus-visible` ではない。
   *
   * 項目は `tabindex="-1"` で、フォーカスが来るのはキーボード操作かスクリプトからの `focus()` に限られる。`:focus-visible` にすると `↓` で移動しているのに何も光らない状態が起きる。
   */
  .mx-menu__item:focus,
  .mx-menu__step:focus {
    outline: none;
    background: var(--mx-color-bg-hover);
    box-shadow: var(--mx-current-marker);
  }

  .mx-menu__steps {
    display: inline-flex;
    margin-inline-start: auto;
    flex: none;
    border: 1px solid var(--mx-color-border-subtle);
    border-radius: var(--mx-radius);
    overflow: hidden;
  }

  .mx-menu__step {
    min-width: 2rem;
    padding: 0 var(--mx-space-2);
    border: none;
    background: none;
    color: var(--mx-color-fg);
    font: inherit;
    font-variant-numeric: tabular-nums;
    cursor: default;
  }

  /* 値の桁数が変わってもボタンの位置が動かないよう、最大の `100%` 相当の幅を確保する。 */
  .mx-menu__step--value {
    min-width: 3.5rem;
    border-inline: 1px solid var(--mx-color-border-subtle);
  }

  .mx-menu__step:hover {
    background: var(--mx-color-bg-hover);
  }

  .mx-menu__step:active {
    background: var(--mx-color-bg-inset);
  }

  .mx-menu__step[aria-disabled='true'] {
    color: var(--mx-color-fg-subtle);
    background: none;
  }

  .mx-menu__empty {
    margin: 0;
    padding: var(--mx-space-1) var(--mx-space-3);
    color: var(--mx-color-fg-subtle);
  }
</style>
