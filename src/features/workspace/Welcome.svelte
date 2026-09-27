<!--
  引数なしで起動したときの画面（F-OPEN-03 / F-OPEN-09）。
  チュートリアルもツアーも出さず、ショートカットの併記だけを教育手段にする。
  押しても何も起きない項目を置くのは Principle 3 に反する。
-->
<script lang="ts">
  import { ja } from '@/i18n/ja';
  import { runCommand } from '@/lib/commands';
  import Icon from '@/lib/Icon.svelte';
  import Mark from '@/lib/Mark.svelte';
  import { splitPath } from '@/lib/path';

  import { recentStore } from './recent.svelte';

  /**
   * 一覧に出す件数。ストアはもっと保持している（`store.rs` の `RECENT_LIMIT`）。
   *
   * 表示件数を絞るのは意図したもので、UX 仕様のスケッチも 3 件である。
   * 一覧が長くなると、Welcome 画面が履歴の一覧として別の役割を持つことになる。
   */
  const RECENT_SHOWN = 6;

  const shown = $derived(recentStore.entries.slice(0, RECENT_SHOWN));
</script>

<div class="mx-welcome mx-over-main">
  <div class="mx-welcome__panel">
    <h1 class="mx-welcome__title">
      <Mark size={30} />
      {ja.welcome.title}
    </h1>

    <!--
      並びは UX 仕様のスケッチどおり（ファイル → フォルダ → 新規）。
      「開く」を先に置くのは、閲覧を中心とした道具であるためである（Principle 2）。
    -->
    <button type="button" class="mx-welcome__action" onclick={() => runCommand('document.open')}>
      <Icon name="document" />
      <span>{ja.welcome.openFile}</span>
      <kbd>Ctrl+O</kbd>
    </button>

    <button type="button" class="mx-welcome__action" onclick={() => runCommand('folder.open')}>
      <Icon name="folder" />
      <span>{ja.welcome.openFolder}</span>
      <kbd>Ctrl+Alt+O</kbd>
    </button>

    <button type="button" class="mx-welcome__action" onclick={() => runCommand('document.new')}>
      <Icon name="document-plus" />
      <span>{ja.welcome.newFile}</span>
      <kbd>Ctrl+N</kbd>
    </button>

    <section class="mx-welcome__recent">
      <h2 class="mx-welcome__heading">{ja.welcome.recent}</h2>
      {#if shown.length === 0}
        <p class="mx-welcome__empty">{ja.welcome.noRecent}</p>
      {:else}
        <ul class="mx-welcome__list">
          {#each shown as entry (entry.path)}
            {@const split = splitPath(entry.path)}
            <li>
              <!-- 開けなかった場合の通知と履歴からの除去は `openPath` の担当。 -->
              <button
                type="button"
                class="mx-welcome__item"
                onclick={() => runCommand('document.openPath', entry.path)}
                title={entry.path}
              >
                <!-- 履歴に並ぶのは常に Markdown なので、ファイルツリーの Markdown と同じ図記号にする。 -->
                <Icon name="document-text" size={14} />
                <span class="mx-welcome__item-name">{split.name}</span>
                <!--
                  `<bdi dir="ltr">` が要る。
                  容器が `direction: rtl`（頭を削るため）なので、パスの両端にある中立文字が bidi で並べ替わる。
                  分離しないと `/virtual` が `virtual/`、`~/notes` が `notes/~`、`C:` が `:C` として表示される。

                  容器と `<bdi>` は分ける。同じ要素に置くと、著者スタイルの `direction: rtl` が属性由来の `ltr` より優先され、分離が RTL 方向で解決されて同じ並べ替えが起きる。
                -->
                <span class="mx-welcome__item-dir"><bdi dir="ltr">{split.dir}</bdi></span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <p class="mx-welcome__hint">{ja.welcome.dropHint}</p>
    <p class="mx-welcome__hint">{ja.welcome.cliHint} <code>marxdown &lt;file.md&gt;</code></p>
  </div>
</div>

<style>
  /*
   * 中央揃えではなく、左揃えのブロックを中央に配置する。
   * 項目とショートカットが縦に揃わないと、一覧として読み取りにくい。
   *
   * 置き場所は `shell.css` の `.mx-over-main` が持つ。
   * `grid-area: main` で指すと Split に割り当て先が無く、右下の暗黙のセルに配置される。
   */
  .mx-welcome {
    z-index: 5;
    display: grid;
    /*
     * `safe` を外さないこと。
     * 中身が器より広いとき、素の `center` は左右へ均等にはみ出し、先頭側へはスクロールできなくなる（スクロールは末尾側にしか伸びない）。
     */
    place-content: safe center;
    background: var(--mx-color-bg);
    overflow: auto;
  }

  /*
   * 幅は器（本文の列）に対して決める。
   *
   * `80vw` はビューポート基準なので、両ペインを開くと列の幅を大きく超える。
   * 例えば幅 820px で両ペインを開くと列は 340px しかなく、480px のパネルが左右へはみ出す。
   */
  .mx-welcome__panel {
    display: flex;
    flex-direction: column;
    gap: var(--mx-space-3);
    width: min(30rem, 100%);
    padding: var(--mx-space-10) var(--mx-space-6);
  }

  .mx-welcome__title {
    display: flex;
    align-items: center;
    gap: var(--mx-space-3);
    margin: 0 0 var(--mx-space-4);
    font-size: var(--mx-font-size-title);
    font-weight: 650;
    letter-spacing: -0.01em;
    color: var(--mx-color-fg);
  }

  .mx-welcome__heading {
    margin: var(--mx-space-5) 0 var(--mx-space-2);
    font-size: var(--mx-font-size-ui-sm);
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--mx-color-fg-subtle);
  }

  /* 「ファイルを開く   Ctrl+O」— 動作とショートカットを両端に置いて対応づける */
  .mx-welcome__action {
    display: flex;
    align-items: center;
    gap: var(--mx-space-3);
    padding: var(--mx-space-2) var(--mx-space-3);
    margin-inline: calc(-1 * var(--mx-space-3));
    border: none;
    border-radius: var(--mx-radius);
    background: none;
    color: var(--mx-color-accent);
    font: inherit;
    font-size: var(--mx-font-size-ui);
    text-align: start;
    cursor: pointer;
  }

  /* ショートカットだけを右端へ送る。図記号と名前は左に固めて、行の頭を揃える。 */
  .mx-welcome__action > kbd {
    margin-inline-start: auto;
  }

  .mx-welcome__list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .mx-welcome__item {
    display: flex;
    align-items: center;
    gap: var(--mx-space-2);
    width: 100%;
    padding: var(--mx-space-1) var(--mx-space-3);
    margin-inline: calc(-1 * var(--mx-space-3));
    border: none;
    border-radius: var(--mx-radius-sm);
    background: none;
    color: var(--mx-color-fg);
    font: inherit;
    font-size: var(--mx-font-size-ui);
    text-align: start;
    cursor: pointer;
  }

  .mx-welcome__item-name {
    flex: none;
  }

  /* 図記号は補助である。名前より一段淡くし、行の頭で目立たせない。 */
  .mx-welcome__item > :global(.mx-icon) {
    color: var(--mx-color-fg-subtle);
  }

  .mx-welcome__item:hover > :global(.mx-icon) {
    color: var(--mx-color-fg-muted);
  }

  /* ディレクトリは補助情報。長いパスは先頭を省略して末尾（＝現在地）を残す */
  .mx-welcome__item-dir {
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

  .mx-welcome__action:hover,
  .mx-welcome__item:hover {
    background: var(--mx-color-bg-hover);
  }

  /*
   * ホバー中の面は `bg-hover` で、そこでは subtle が 4.5:1 に届かない。
   * 文字色を 1 段上げる（`tokens.css` の文字色のコメント）。
   */
  .mx-welcome__item:hover .mx-welcome__item-dir {
    color: var(--mx-color-fg-muted);
  }

  /* 押し込み。Windows は「ホバーより淡い面」で押下を表す（`app/CaptionButton.svelte` と同じ）。 */
  .mx-welcome__action:active,
  .mx-welcome__item:active {
    background: var(--mx-color-bg-inset);
  }

  .mx-welcome__action:focus-visible,
  .mx-welcome__item:focus-visible {
    outline: 2px solid var(--mx-color-accent);
    outline-offset: -2px;
  }

  .mx-welcome__empty,
  .mx-welcome__hint {
    margin: 0;
    color: var(--mx-color-fg-subtle);
    font-size: var(--mx-font-size-ui);
  }

  .mx-welcome__hint:first-of-type {
    margin-top: var(--mx-space-5);
  }
</style>
