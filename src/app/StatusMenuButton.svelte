<!--
  ステータスバーの「押すと選択肢が出る」項目（03.ux-spec/07-status-and-notifications.md §3）。
  モードとエンコーディングが同じ形をしているため、器を 1 つにしてある。
  選択肢も見た目も押されるまでロードしない（動的 import / `app/MenuButton.svelte` と同じ形）。
  ステータスバーは `overflow: hidden` であるため、パネルを `position: absolute` で置くと切り落とされる。
  そのため `position: fixed` にし、位置は押した瞬間にボタンが自分の位置を測定して渡す（開いてから測定すると、1 フレームだけ誤った位置に表示された後に正しい位置へ切り替わる）。
-->
<script lang="ts">
  import type { StatusMenu, StatusMenuAnchor, StatusMenuKind } from '@/features/status/props';

  interface Props {
    kind: StatusMenuKind;
    /** いまの値。**ボタンの見た目そのもの**なので、`main` 側が持っている。 */
    label: string;
    /** ツールチップ。「押すと何が起きるか」を言う。 */
    title: string;
  }

  const { kind, label, title }: Props = $props();

  /** ロード済みのメニュー本体。**`null` のうちはチャンクを取りに行っていない。** */
  let menu = $state<StatusMenu | null>(null);
  let open = $state(false);
  let button: HTMLButtonElement;

  /** パネルを置く位置（ビューポート基準）。**押した瞬間の値**で固定する。 */
  let anchor = $state<StatusMenuAnchor | null>(null);

  async function show(): Promise<void> {
    const rect = button.getBoundingClientRect();
    // 下端をボタンの上端に合わせる（ステータスバーの上に開く）。
    anchor = { left: rect.left, bottom: globalThis.innerHeight - rect.top };

    if (!menu) {
      const loaded = await import('@/features/status/StatusMenu.svelte');
      menu = loaded.default;
    }
    open = true;
  }

  /** 閉じる。**既定でボタンへフォーカスを戻す**（`app/MenuButton.svelte` と同じ理由）。 */
  function hide(refocus = true): void {
    open = false;
    if (refocus) button.focus();
  }

  function toggle(): void {
    if (open) hide();
    else void show();
  }

  /** 閉じているときの `↑` / `↓` でも開く（WAI-ARIA のメニューボタン）。 */
  function onKeydown(event: KeyboardEvent): void {
    if (open) return;
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      void show();
    }
  }
</script>

<span class="mx-statusmenubutton">
  <button
    type="button"
    class="mx-statusbar__button"
    bind:this={button}
    {title}
    aria-haspopup="menu"
    aria-expanded={open}
    onclick={toggle}
    onkeydown={onKeydown}
  >
    {label}
  </button>

  {#if open && menu && anchor}
    {@const Menu = menu}
    <Menu {kind} {anchor} onclose={hide} />
  {/if}
</span>

<style>
  /* 開いたパネルの位置の基準。ステータスバーの高さを変えないよう `inline-flex`。 */
  .mx-statusmenubutton {
    position: relative;
    display: inline-flex;
    flex: none;
  }
</style>
