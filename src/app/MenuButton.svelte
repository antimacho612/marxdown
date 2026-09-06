<!--
  ハンバーガーメニューのボタン（03.ux-spec/01-screen-layout.md §3「初学者の逃げ道」）。
  メニューバーは置かず、タイトルバー左端にこれ 1 つだけ置く。
  すべての機能はキーバインドから到達できる。
  中身（項目・見た目）は押されるまでロードしない（動的 import / M1.5 完了条件）。
-->
<script lang="ts">
  import type { AppMenu } from '@/features/menu';
  import { ja } from '@/i18n/ja';

  /**
   * ロード済みのメニュー本体。`null` の間はチャンクを取得していない。
   *
   * `$state` はオブジェクトを Proxy で包むが、コンポーネントは関数であるためそのまま保持される。
   */
  let menu = $state<AppMenu | null>(null);
  let open = $state(false);
  let button: HTMLButtonElement;

  /** 開いた直後にフォーカスを置く位置。矢印キーで開いたときだけ末尾になる。 */
  let focusLast = $state(false);

  async function show(last = false): Promise<void> {
    focusLast = last;
    if (!menu) {
      const loaded = await import('@/features/menu/lazy/AppMenu.svelte');
      menu = loaded.default;
    }
    open = true;
  }

  /**
   * 閉じる。既定ではボタンへフォーカスを戻す。
   *
   * 戻さないと、`Esc` で閉じた時点でフォーカスが `<body>` へ移り、キーボード操作での現在位置が分からなくなる。
   * 項目を実行して閉じた場合（`refocus = false`）は実行先へ操作が移るため、戻さない。
   */
  function hide(refocus = true): void {
    open = false;
    if (refocus) button.focus();
  }

  function toggle(): void {
    if (open) hide();
    else void show();
  }

  /**
   * 閉じているときの `↓` / `↑` で開く（WAI-ARIA のメニューボタン）。
   * `↑` で開いた場合は末尾の項目にフォーカスする。マウスを使わずに末尾へ到達できるようにするためである。
   */
  function onKeydown(event: KeyboardEvent): void {
    if (open) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      void show();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      void show(true);
    }
  }
</script>

<!--
  `data-tauri-drag-region="false"` を包む要素に置いてある。

  タイトルバー全体がドラッグ領域であるため、これが無いとメニューの見出しや区切り線をドラッグしたときにウィンドウが移動する
  （ボタンは Tauri 側が自動で除外するが、それ以外の要素は除外されない）。
  開いたパネルもこの要素の内側に入るため、除外はこの 1 か所で足りる。
-->
<div class="mx-menubutton" data-tauri-drag-region="false">
  <button
    type="button"
    class="mx-menubutton__button"
    bind:this={button}
    aria-label={ja.titlebar.menu}
    title={ja.titlebar.menu}
    aria-haspopup="menu"
    aria-expanded={open}
    onclick={toggle}
    onkeydown={onKeydown}
  >
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
        <path d="M2 4h12" />
        <path d="M2 8h12" />
        <path d="M2 12h12" />
      </g>
    </svg>
  </button>

  {#if open && menu}
    {@const Menu = menu}
    <Menu onclose={hide} {focusLast} />
  {/if}
</div>

<style>
  .mx-menubutton {
    position: relative;
    align-self: stretch;
    display: flex;
    flex: none;
  }

  .mx-menubutton__button {
    display: grid;
    place-items: center;
    width: calc(var(--mx-titlebar-height) + var(--mx-space-2));
    padding: 0;
    border: none;
    background: none;
    color: var(--mx-color-fg-muted);
    cursor: default;
  }

  .mx-menubutton__button:hover,
  .mx-menubutton__button[aria-expanded='true'] {
    background: var(--mx-color-bg-hover);
    color: var(--mx-color-fg);
  }

  .mx-menubutton__button:focus-visible {
    outline: 2px solid var(--mx-color-accent);
    outline-offset: -2px;
  }
</style>
