<!--
  ハンバーガーメニューのボタン（03.ux-spec/01-screen-layout.md §3「初学者の逃げ道」）。

  **メニューバーは置かない。** 代わりにタイトルバー左端にこれを 1 つだけ置く。
  すべての機能はキーバインドから到達でき、M3 でコマンドパレットが入れば
  そちらが主役になる。ここは「まだ何も覚えていない人」のための入口である。

  # 中身はここに無い

  押されるまで、メニューの項目も見た目もロードしない（動的 import）。
  **中身が遅延チャンクに載っていることは M1.5 の完了条件**
  （06.roadmap/m1.5-shell-and-settings.md §3）。

  クリティカルパスに載るのはこのボタン 1 つ分だけで、
  項目が増えても（設定 / 終了）起動は太らない。

  2 回目以降の動的 import は解決済みの Promise を返すので、遅れるのは初回だけ。
-->
<script lang="ts">
  import type { AppMenu } from '@/features/menu/props';
  import { ja } from '@/i18n/ja';

  /**
   * ロード済みのメニュー本体。**`null` のうちはチャンクを取りに行っていない**。
   *
   * `$state` はオブジェクトを Proxy で包むが、コンポーネントは関数なので素通しになる。
   */
  let menu = $state<AppMenu | null>(null);
  let open = $state(false);
  let button: HTMLButtonElement;

  /** 開いた直後にどこへフォーカスを置くか。矢印キーで開いたときだけ末尾へ行く。 */
  let focusLast = $state(false);

  async function show(last = false): Promise<void> {
    focusLast = last;
    if (!menu) {
      const loaded = await import('@/features/menu/AppMenu.svelte');
      menu = loaded.default;
    }
    open = true;
  }

  /**
   * 閉じる。**既定でボタンへフォーカスを戻す。**
   *
   * 戻さないと、`Esc` で閉じた瞬間にフォーカスが `<body>` へ落ちて、
   * キーボードだけで操作している人が現在地を見失う。
   * 項目を実行して閉じた場合（`refocus = false`）は、実行先へ関心が移っているので戻さない。
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
   * `↑` で開いたら末尾の項目に着地する。マウスを使わずに末尾へ行けるようにするため。
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

  タイトルバー全体がドラッグ領域なので、これが無いとメニューの見出しや区切り線を
  掴んだときにウィンドウが動き出す（ボタンは Tauri 側が自動で除外するが、
  それ以外の要素は除外されない）。**開いたパネルごとここに入る**ので、
  除外はこの 1 か所で足りる。
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
