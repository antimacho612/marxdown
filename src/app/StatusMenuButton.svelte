<!--
  ステータスバーの「押すと選択肢が出る」項目（03.ux-spec/07-status-and-notifications.md §3）。

  モード（`クリックでモード切替メニュー`）とエンコーディング（`クリックで
  エンコーディング再解釈`）が、同じ形をしている。**器を 1 つにしてある。**

  # 中身はここに無い

  押されるまで、選択肢も見た目もロードしない（動的 import）。
  クリティカルパスに載るのはこのボタン 1 つ分と、いま出している値だけ。
  ハンバーガーメニュー（`app/MenuButton.svelte`）と同じ形である。

  # 開く場所は、ここで測る

  **ステータスバーは `overflow: hidden` である**（狭い窓で項目がはみ出すのを
  切るため / `styles/shell.css`）。中に `position: absolute` で置いたパネルは
  丸ごと切り落とされ、DOM にはあるのに何も見えない。

  そこでパネルは `position: fixed` にしてある。位置は**押した瞬間にボタンが
  自分を測って渡す**。開いてから測ると、1 フレームだけ左上に出てから飛ぶ。
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
