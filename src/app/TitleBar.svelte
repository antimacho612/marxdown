<!--
  カスタムタイトルバー（03.ux-spec/01-screen-layout.md §1）。

  ```text
  ┌──────────────────────────────────────────────────────────────┐
  │ ☰  README.md  C:\…\marxdown                          ─ □ ✕  │
  └──────────────────────────────────────────────────────────────┘
  ```

  `decorations: false`（`src-tauri/src/window.rs`）にしたので、この 1 行が
  OS のタイトルバーの代わりになる。OS 標準のタイトルバーとタブが二段になるのを避け、
  縦 30px を本文に返すのが目的（06.roadmap/m1.5-shell-and-settings.md §2）。

  # M3 でタブが入る場所

  §2 の展開状態では、いまファイル名が出ている場所がタブストリップになる。

  ```text
  ┌──────────────────────────────────────────────────────────────┐
  │ ☰ ┃README.md ✕┃ design.md ✕┃ notes.md ●✕┃           ─ □ ✕  │
  └──────────────────────────────────────────────────────────────┘
  ```

  そのために中央領域を `center` スニペットとして外へ開いてある。
  **M3 は `App.svelte` から `center` にタブストリップを渡すだけでよく、
  このコンポーネントもレイアウト（`shell.css` の grid）も触らずに済む。**
  タブが 1 枚のときはタブを出さない（[ADR-0004](../../docs.local/adr/)）ので、
  既定のファイル名表示はそのまま残す。

  # ドラッグ

  `data-tauri-drag-region="deep"` を 1 枚被せてある。Tauri 本体が注入する
  ハンドラが、掴んだらネイティブのドラッグへ、ダブルクリックなら最大化へ渡す。
  `<button>` の類は自動で除外されるので、ボタンごとに打ち消す必要はない。
  除外が要るのはボタン以外の要素を含むもの（＝開いたメニューのパネル）だけで、
  それは `MenuButton.svelte` 側で閉じている。
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  import { documentStore } from '@/features/document/store.svelte';
  import { ja } from '@/i18n/ja';
  import { splitPath } from '@/lib/path';

  import MenuButton from './MenuButton.svelte';
  import WindowControls from './WindowControls.svelte';

  interface Props {
    /**
     * 中央領域。**M3 でタブストリップを差し込むための口。**
     * 渡されなければ、開いているファイル名を出す（タブ 1 枚のときの姿）。
     */
    center?: Snippet;
  }

  const { center }: Props = $props();

  const meta = $derived(documentStore.meta);
  const split = $derived(splitPath(meta?.path ?? ''));
  const dirty = $derived(documentStore.isDirty);

  /**
   * ファイル名の位置に出す文字列。
   *
   * まだ一度も保存していない文書（`Ctrl+N`）にはパスが無いので、
   * 名前として「無題」を出す（`features/document/new.ts`）。
   * 何も開いていないときはアプリ名。
   */
  const name = $derived(meta === null ? ja.app.name : meta.path === null ? ja.titlebar.untitled : split.name);
</script>

<header class="mx-titlebar" data-tauri-drag-region="deep">
  <MenuButton />

  <div class="mx-titlebar__center">
    {#if center}
      {@render center()}
    {:else}
      <span class="mx-titlebar__name">{name}</span>
      <!--
        未保存の印（03.ux-spec/07-status-and-notifications.md §1）。**ファイル名の右に `●`。**

        ステータスバーには出さない（§1 の表が「変更なし。うるさくしない」と
        定めている）。M3 でタブが入ると、この印はタブ側へ移る。
      -->
      {#if meta && dirty}
        <span class="mx-titlebar__dirty" title={ja.save.dirtyLabel} aria-label={ja.save.dirtyLabel}>●</span>
      {/if}
      <!-- ディレクトリは保存してから出る。無題の文書には置き場所が無い。 -->
      {#if meta && meta.path !== null}
        <span class="mx-titlebar__dir">{split.dir}</span>
      {/if}
    {/if}
  </div>

  <WindowControls />
</header>

<style>
  /*
   * 領域は名前で指す（`shell.css` の `grid-template-areas`）。
   * 本文が DOM 上で先に来る（= クロームのマウントを待たずに描ける）ので、
   * DOM 順とレイアウト順は一致しない。
   *
   * `z-index` はメニューのパネルのため。パネル側ではなくここに置くことで、
   * 「タイトルバーから出るものは本文より手前」が 1 か所で決まる。
   */
  .mx-titlebar {
    grid-area: titlebar;
    position: relative;
    z-index: 40;
    display: flex;
    align-items: stretch;
    border-bottom: 1px solid var(--mx-color-border-subtle);
    background: var(--mx-color-bg-subtle);
    font-size: var(--mx-font-size-ui);
    min-width: 0;
  }

  /*
   * 中央領域。**ここが M3 でタブストリップに置き換わる。**
   *
   * `min-width: 0` が要る。これが無いと、長いパスが縮まずに
   * ウィンドウ操作ボタンを画面外へ押し出す。
   */
  .mx-titlebar__center {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: var(--mx-space-2);
    padding-inline: var(--mx-space-2);
  }

  .mx-titlebar__name {
    font-weight: 600;
    white-space: nowrap;
  }

  /*
   * 未保存の印。**本文と同じ色にしない。**
   * 常時見えるものではないので、出たときに気づく程度の強さがあればよい。
   */
  .mx-titlebar__dirty {
    color: var(--mx-color-fg-muted);
    font-size: 10px;
    line-height: 1;
  }

  .mx-titlebar__dir {
    color: var(--mx-color-fg-subtle);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }
</style>
