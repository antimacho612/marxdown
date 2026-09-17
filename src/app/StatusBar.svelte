<!--
  ステータスバー（03.ux-spec/07-status-and-notifications.md §3）。
  押しても何も起きないものはボタンにしない（§3.1）。
  エンコーディングの再解釈は読み直しを伴い、EOL の変換は次の保存で書き戻す（`document/encoding.ts` / `document/eol.ts`）。
  スクロール同期の `⇄` は Split のときだけ表示する（03.ux-spec/03-split-mode.md §2）。
  自動で消える情報（「外部の変更を読み込みました」など）もここに出す（issue #60）。
  計測値は開発ビルドのみ表示する（06.roadmap/invariants.md）。
-->
<script lang="ts">
  import { documentStore, effectiveEol, nextEol as nextEolOf, toggleEol } from '@/features/document';
  import { formatZoom } from '@/features/preview';
  import { viewStore } from '@/features/view';
  import { ja } from '@/i18n/ja';

  import StatusBarButton from './StatusBarButton.svelte';
  import StatusMenuButton from './StatusMenuButton.svelte';

  const meta = $derived(documentStore.meta);
  const message = $derived(documentStore.statusMessage);
  const textStats = $derived(documentStore.textStats);
  const stats = $derived(documentStore.stats);

  /**
   * カーソル位置（§3 の但し書き「Preview では非表示」）。
   *
   * 条件が 2 つあるのは、非表示にする理由が 2 つあるためである。
   * Preview にはカーソルが存在せず、エディターがマウントされる前は位置が未確定である。
   * 前者はモードで、後者はストアの `null` で判定する。
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
      選択肢は押されるまでロードしない（`app/StatusMenuButton.svelte`）。
    -->
    <StatusMenuButton kind="mode" label={ja.status.mode[viewStore.mode]} title={ja.status.modeSwitch} />
    <StatusMenuButton kind="encoding" label={ja.status.encoding[meta.encoding]} title={ja.status.encodingReinterpret} />
    <!--
      EOL（§3「クリックで EOL 変換」）。押した時点ではディスクを変更しない。
      次の保存で書き戻す改行コードが変わり、未保存の印が付く（`document/eol.ts`）。
      表示しているのは変換の指定を反映した現在値であり、`meta.eol`（ディスク上の値）ではない。
    -->
    {#if eol && nextEol}
      <StatusBarButton onclick={() => toggleEol()} title={ja.status.eolConvert(nextEol)}>
        {eol.toUpperCase()}
      </StatusBarButton>
    {/if}
    {#if meta.bom}<span>BOM</span>{/if}
    {#if meta.readonly}<span>{ja.status.readonly}</span>{/if}
    <!--
      カーソル位置（§3）。押せない項目である。
      §3.1 の表で操作先が決まっているのは倍率・EOL・エンコーディング・文字数・モードで、ここは表示だけである。
      行ジャンプ（`Ctrl+G`）はコマンドパレットに載せる（M3）。
    -->
    {#if cursor}
      <span class="mx-statusbar__cursor mx-statusbar__optional">{ja.status.cursor(cursor.line, cursor.column)}</span>
    {/if}
    {#if textStats}
      <span class="mx-statusbar__optional">{ja.status.chars(textStats.chars)}</span>
      <span class="mx-statusbar__optional">{ja.status.readingTime(textStats.readingMinutes)}</span>
    {/if}
  {/if}

  <!--
    スクロール同期（F-MODE-05 / 03.ux-spec/03-split-mode.md §2）。Split のときだけ表示する。
    片面しか表示されていないときは押しても意味が無く、操作できない項目は並べない
    （Principle 3 / メニューの `isListed` と同じ判断）。

    ラベルは現在の状態を示し、ツールチップは押したときの結果を示す。
    アイコンだけでは、現在有効なのか押すと有効になるのかを判別できない。
  -->
  {#if meta && viewStore.mode === 'split'}
    <StatusBarButton
      aria-pressed={viewStore.scrollSync}
      onclick={() => (viewStore.scrollSync = !viewStore.scrollSync)}
      title={ja.split.toggleSync}
    >
      ⇄ {viewStore.scrollSync ? ja.split.syncOn : ja.split.syncOff}
    </StatusBarButton>
  {/if}

  <!--
    一時メッセージ（03.ux-spec/07-status-and-notifications.md §2 の「情報」/ issue #60）。
    本文の上に重ねると読んでいる箇所が隠れるため、自動で消える情報はここに出す。
    要素は空でも残す。`aria-live` は後から現れた領域の変化を読み上げないため、入れ替えるのは中身だけにする。
  -->
  <span class="mx-statusbar__message" role="status">
    {#key message}
      <span class="mx-statusbar__message-text">{message ?? ''}</span>
    {/key}
  </span>

  {#if import.meta.env.DEV && stats}
    {#if stats.chunks > 1}<span>{stats.chunks} chunks</span>{/if}
    <span>{ja.status.parsedIn(stats.parseMs)}</span>
    <span>{ja.status.paintedIn(stats.paintMs)}</span>
  {/if}

  <!--
    表示倍率（F-VIEW-11）。クリックで倍率の選択肢を開く。

    以前は押すと等倍に戻していた。
    等倍へ戻す操作は `Ctrl+0` とコマンドパレットにあり、100% も選択肢の 1 つとして並ぶため、経路は失われない。

    倍率が 100% のときも表示する。
    現在が等倍であると分かること、および操作できる場所が常に同じ位置にあることを、項目を 1 つ減らすことより優先する。
  -->
  {#if meta}
    <StatusMenuButton kind="zoom" label={formatZoom(viewStore.zoom)} title={ja.status.zoomSelect} />
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
    font-size: var(--mx-font-size-ui-sm);
    white-space: nowrap;
    min-width: 0;
    overflow: hidden;
  }

  /*
   * 幅が足りないときに落とす項目。**表示だけの項目に限る**（§3.1 の表で「押せない」とされているもの）。
   *
   * `overflow: hidden` は右端から切り落とすため、何もしないと一番右にある倍率から消える。
   * 実測では Split で 475.5px、カーソル位置が出ると約 562px 必要で、ウィンドウの最小値
   * （`src-tauri/src/window.rs` の `min_inner_size(480.0, 360.0)`）では倍率が押せなくなっていた。
   *
   * ステータスバーは常にウィンドウの全幅であるため、ビューポート幅で判定する。
   * `container-type` を付けると `contain: layout` が効き、`position: fixed` で開くメニュー
   * （`app/StatusMenuButton.svelte`）の位置の基準がビューポートからこの要素に変わってしまう。
   */
  @media (width < 580px) {
    .mx-statusbar__optional {
      display: none;
    }
  }

  /*
   * 一時メッセージ。空のときは余白として働き、左右の項目の位置を動かさない。
   * 長い文言でも右端の倍率を押し出さないよう、自分が先に縮んで省略記号になる。
   */
  .mx-statusbar__message {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .mx-statusbar__message-text {
    /* 出現に 150ms（03.ux-spec/09-motion.md） */
    animation: mx-status-message-in 150ms ease-out;
  }

  @keyframes mx-status-message-in {
    from {
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .mx-statusbar__message-text {
      animation: none;
    }
  }

  /*
   * カーソル位置。桁を揃える。
   * 入力のたびに桁幅が変わると、右にある項目が 1 文字ずつ移動する（03.ux-spec/09-motion.md の禁則に該当する）。
   * 数字の幅を揃えるだけでは足りず `Ln 9` から `Ln 10` への桁数の増減は残るが、それは行をまたぐときにしか発生しない。
   */
  .mx-statusbar__cursor {
    font-variant-numeric: tabular-nums;
  }
</style>
