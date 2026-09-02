<!--
  ステータスバー（03.ux-spec/07-status-and-notifications.md §3）。

  ```text
  Preview   UTF-8  LF   12,345 文字   約 4 分            100%
  ```

  **押しても何も起きないものをボタンに見せない**（§3.1 の表）。
  押せるのはモード・エンコーディング・EOL・倍率、そして Split のときの `⇄`。

  ```text
  モード         押すと選択肢が出る（Preview / Edit / Split）
  エンコーディング  押すと選び直せる。**読み直しを伴う**（`document/encoding.ts`）
  EOL           押すと変換する。**次の保存で書き戻す**（`document/eol.ts`）
  カーソル位置    表示だけ。Preview では出ない（§3 の但し書き）
  文字数 / 読了時間  表示だけ。詳細の置き場所はコマンドパレット（M3）
  倍率           押すと等倍に戻る
  ```

  スクロール同期の `⇄` は Split のときだけ出る（03.ux-spec/03-split-mode.md §2）。

  計測値（パース / 描画）は開発ビルドでのみ出す。開発中の道具であって、
  製品の画面に居座る理由が説明できない（06.roadmap/invariants.md）。
-->
<script lang="ts">
  import { effectiveEol, nextEol as nextEolOf, toggleEol } from '@/features/document/eol';
  import { documentStore } from '@/features/document/store.svelte';
  import { formatZoom, zoomReset } from '@/features/preview/zoom';
  import { viewStore } from '@/features/view/store.svelte';
  import { ja } from '@/i18n/ja';

  import StatusMenuButton from './StatusMenuButton.svelte';

  const meta = $derived(documentStore.meta);
  const textStats = $derived(documentStore.textStats);
  const stats = $derived(documentStore.stats);

  /**
   * カーソル位置（§3 の但し書き「Preview では非表示」）。
   *
   * 条件が 2 つあるのは、**隠れる理由が 2 つあるから**である。
   * Preview では「カーソルという概念が画面に無い」、エディタが載る前は
   * 「まだ誰も位置を知らない」。前者はモードで、後者はストアの `null` で決まる。
   */
  const cursor = $derived(viewStore.mode === 'preview' ? null : documentStore.cursor);

  /** 表示する改行コードと、押したときの行き先（`features/document/eol.ts`）。 */
  const eol = $derived(effectiveEol());
  const nextEol = $derived(nextEolOf());
</script>

<footer class="mx-statusbar">
  {#if meta}
    <!--
      モードとエンコーディング（§3.1 の「クリックでモード切替メニュー」/「再解釈」）。
      **選択肢は押されるまでロードしない**（`app/StatusMenuButton.svelte`）。
    -->
    <StatusMenuButton kind="mode" label={ja.status.mode[viewStore.mode]} title={ja.status.modeSwitch} />
    <StatusMenuButton kind="encoding" label={ja.status.encoding[meta.encoding]} title={ja.status.encodingReinterpret} />
    <!--
      EOL（§3「クリックで EOL 変換」）。**押した時点ではディスクを変えない。**
      次の保存で書き戻す改行コードが変わり、未保存の印が付く（`document/eol.ts`）。
      出しているのは希望を含んだ現在値で、`meta.eol`（ディスクの姿）ではない。
    -->
    {#if eol && nextEol}
      <button
        type="button"
        class="mx-statusbar__button"
        onclick={() => toggleEol()}
        title={ja.status.eolConvert(nextEol)}
      >
        {eol.toUpperCase()}
      </button>
    {/if}
    {#if meta.bom}<span>BOM</span>{/if}
    {#if meta.readonly}<span>{ja.status.readonly}</span>{/if}
    <!--
      カーソル位置（§3）。**押せない。** §3.1 の表で行き先が決まっているのは
      倍率・EOL・エンコーディング・文字数・モードで、ここは表示だけである。
      行ジャンプ（`Ctrl+G`）はコマンドパレットに乗る（M3）。
    -->
    {#if cursor}<span class="mx-statusbar__cursor">{ja.status.cursor(cursor.line, cursor.column)}</span>{/if}
    {#if textStats}
      <span>{ja.status.chars(textStats.chars)}</span>
      <span>{ja.status.readingTime(textStats.readingMinutes)}</span>
    {/if}
  {/if}

  <!--
    スクロール同期（F-MODE-05 / 03.ux-spec/03-split-mode.md §2）。**Split のときだけ出す。**
    片面しか見えていないときに押しても意味が無く、押せない項目を並べない
    （Principle 3 / メニューの `isListed` と同じ判断）。

    ラベルは状態を言い、ツールチップが結果を言う。アイコンだけでは
    「ON なのか」「押すと ON になるのか」が読めない。
  -->
  {#if meta && viewStore.mode === 'split'}
    <button
      type="button"
      class="mx-statusbar__button"
      aria-pressed={viewStore.scrollSync}
      onclick={() => (viewStore.scrollSync = !viewStore.scrollSync)}
      title={ja.split.toggleSync}
    >
      ⇄ {viewStore.scrollSync ? ja.split.syncOn : ja.split.syncOff}
    </button>
  {/if}

  <span class="mx-statusbar__spacer"></span>

  {#if import.meta.env.DEV && stats}
    {#if stats.chunks > 1}<span>{stats.chunks} chunks</span>{/if}
    <span>{ja.status.parsedIn(stats.parseMs)}</span>
    <span>{ja.status.paintedIn(stats.paintMs)}</span>
  {/if}

  <!--
    表示倍率（F-VIEW-11）。**クリックで等倍に戻る**（§3）。

    倍率が 100% のときも出しておく。「今は等倍だ」と分かることと、
    押せる場所がいつも同じ位置にあることのほうが、1 項目減らすより価値がある。
  -->
  {#if meta}
    <button type="button" class="mx-statusbar__button" onclick={() => void zoomReset()} title={ja.status.zoomReset}>
      {formatZoom(viewStore.zoom)}
    </button>
  {/if}
</footer>

<style>
  .mx-statusbar {
    grid-area: statusbar;
    display: flex;
    align-items: center;
    gap: var(--mx-space-4);
    padding-inline: var(--mx-space-4);
    border-top: 1px solid var(--mx-color-border-subtle);
    background: var(--mx-color-bg-subtle);
    color: var(--mx-color-fg-muted);
    font-size: 11px;
    white-space: nowrap;
    min-width: 0;
    overflow: hidden;
  }

  .mx-statusbar__spacer {
    flex: 1;
  }

  /*
   * カーソル位置。**桁を揃える。** 打つたびに桁幅が変わると、
   * 右にある項目が 1 文字ずつ揺れる（03.ux-spec/09-motion.md の禁則に触れる）。
   * 数字の幅が揃うだけでは足りず、`Ln 9` → `Ln 10` の桁数の増減は残るが、
   * そちらは行をまたぐときにしか起きない。
   */
  .mx-statusbar__cursor {
    font-variant-numeric: tabular-nums;
  }
</style>
