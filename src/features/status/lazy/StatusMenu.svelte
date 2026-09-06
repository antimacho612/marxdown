<!--
  ステータスバーから上に開く小さなメニュー（03.ux-spec/07-status-and-notifications.md §3）。
  遅延チャンクで、ステータスバーの項目が押されるまでロードされない（ハンバーガーメニューと同じ分け方）。

  ステータスバーは画面最下段にあり `overflow: hidden` なので、`position: fixed` で上に開く（`absolute` では切り落とされる）。
  座標は押した瞬間にボタンが測って渡す（`app/StatusMenuButton.svelte`）。
  キーボード操作（`Esc` / `↑↓` / `Home` `End` / `Tab` 循環）は AppMenu と同じ規則にしてある。
-->
<script lang="ts">
  import { onMount } from 'svelte';

  import type { StatusMenuProps } from '../props';
  import { statusMenuItems, type StatusMenuItem } from './items';

  const { kind, anchor, onclose }: StatusMenuProps = $props();

  /**
   * 並べる項目（`items.ts` / 同じチャンク）。
   *
   * 開いている間に項目が増減することはない。
   * それでも `$derived` にしているのは、`statusMenuItems` がストア（`documentStore.meta` / `viewStore.mode`）を参照するためであり、
   * 定数にすると初期値しか反映されなくなる。
   */
  const items: StatusMenuItem[] = $derived(statusMenuItems(kind));

  let panel: HTMLElement;

  function buttons(): HTMLButtonElement[] {
    return [...panel.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')];
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

  /**
   * 開いた直後は現在選択されている行にフォーカスする。
   *
   * 先頭にフォーカスすると、`↓` の押下回数と移動先が現在の選択に依存しなくなる代わりに、現在の選択を目視で探す必要が生じる。
   * 選択式のメニューでは現在の選択から始めるほうが操作が短くなる。
   */
  onMount(() => {
    const list = buttons();
    const current = items.findIndex((item) => item.checked);
    (list[current] ?? list[0])?.focus();
  });

  function activate(item: StatusMenuItem): void {
    // 先に閉じる。読み直しのように非同期に終わるものでも、
    // 押した瞬間に消えるほうが「効いた」ことが伝わる（AppMenu と同じ判断）。
    onclose(false);
    item.run();
  }

  function onKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'Escape': {
        // グローバルに Escape を握っている機能（検索パネル）へ渡さない。
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
   * 外側の判定はパネルの親要素を基準にする（ボタン自身を含めないと、開いた直後に閉じてしまう / `AppMenu` と同じ）。
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

<div
  class="mx-statusmenu"
  role="menu"
  tabindex="-1"
  style="left: {anchor.left}px; bottom: {anchor.bottom}px"
  bind:this={panel}
  onkeydown={onKeydown}
>
  {#each items as item (item.id)}
    <button
      type="button"
      role="menuitemradio"
      aria-checked={item.checked}
      tabindex="-1"
      class="mx-statusmenu__item"
      onclick={() => activate(item)}
    >
      <!-- 印は装飾。読み上げには `aria-checked` が伝わるので、記号は隠す。 -->
      <span class="mx-statusmenu__check" aria-hidden="true">{item.checked ? '✓' : ''}</span>
      {item.label}
    </button>
  {/each}
</div>

<style>
  /*
   * ステータスバーの項目から上方向に開く（下に領域が無いため）。
   *
   * `fixed` にしているのは、ステータスバーが `overflow: hidden` であるためである（`styles/shell.css`）。
   * `left` / `bottom` はボタン側が測定して渡す。
   */
  .mx-statusmenu {
    position: fixed;
    z-index: 40;

    min-width: 10rem;
    max-height: 60vh;
    overflow-y: auto;

    padding: var(--mx-space-1) 0;
    border: 1px solid var(--mx-color-border);
    border-radius: var(--mx-radius);
    background: var(--mx-color-bg-subtle);
    box-shadow: var(--mx-shadow-1);
    font-size: var(--mx-font-size-ui);
    color: var(--mx-color-fg);
  }

  .mx-statusmenu:focus {
    outline: none;
  }

  .mx-statusmenu__item {
    display: flex;
    align-items: baseline;
    gap: var(--mx-space-2);
    width: 100%;
    padding: var(--mx-space-1) var(--mx-space-3);
    border: none;
    background: none;
    color: inherit;
    font: inherit;
    font-size: var(--mx-font-size-ui);
    text-align: start;
    white-space: nowrap;
    cursor: default;
  }

  /* 印の桁を固定する。付いている行だけ字下げがずれると、一覧として読めない。 */
  .mx-statusmenu__check {
    flex: none;
    width: 1em;
    color: var(--mx-color-accent);
  }

  .mx-statusmenu__item:hover {
    background: var(--mx-color-bg-hover);
  }

  /* `:focus-visible` ではない理由は AppMenu と同じ（`tabindex="-1"` のため）。 */
  .mx-statusmenu__item:focus {
    outline: none;
    background: var(--mx-color-bg-hover);
    box-shadow: inset 2px 0 0 var(--mx-color-accent);
  }
</style>
