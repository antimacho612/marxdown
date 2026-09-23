<!--
  タブストリップ（F-NAV-01, 02 / 03.ux-spec/01-screen-layout.md §2）。
  タイトルバーの中央領域（`TitleBar.svelte` の `center`）に差し込まれる。

  **主ウィンドウでは 2 枚以上のときしか描かれない。** 出し分けは差し込む側（`app/App.svelte`）が行う。
  1 枚のときはタイトルバーが既定のファイル名表示のままであり、この経路を通らない（§1「タブも 1 枚のうちは出さない」）。
  サテライト（F-OPEN-06）だけは 1 枚でも描く。その窓に何が入っているかを示すものが他に無いためである。

  窓の外へ落とすと、そのタブはサテライトへ切り離される（F-OPEN-06 / `release`）。

  タブそのものはボタンで構成する。
  タイトルバーは `data-tauri-drag-region="deep"` でネイティブドラッグを掴む領域だが、`<button>` は自動的に除外されるため、タブを押しても窓が動かない。
  逆にタブが並んでいない余白は掴めるままになる。

  並べ替えはポインタイベントで行う（F-NAV-02）。
  HTML5 の drag イベントは使えない。ドロップされたファイルの絶対パスを受け取るために `disable_drag_drop_handler()` を呼べず（`04.tech-stack/06-rust.md` §6）、ネイティブのハンドラが有効な状態では WebView2 がページ内のドラッグも受け取るためである。
-->
<script lang="ts">
  import { ja } from '@/i18n/ja';
  import { splitPath } from '@/lib/path';

  import { moveTabToSatellite } from './new-window';
  import { activateTab, closeTab, isTabDirty, moveTab, tabMeta, tabsStore, type Tab } from './tabs.svelte';

  /** 並べ替えと判断するまでの移動量（px）。押し込みの手ぶれで並びが変わらないようにする。 */
  const DRAG_THRESHOLD = 6;

  /**
   * 切り離した窓を、落とした位置からずらす量（CSS px）。
   *
   * 落とした点を窓の左上にすると、掴んでいたタブが窓の外に出た位置に現れる。
   * タイトルバーの中にカーソルが乗るぶんだけ戻すと、掴んだものがそこに置かれたように見える。
   */
  const DETACH_OFFSET_X = 48;
  const DETACH_OFFSET_Y = 12;

  let strip: HTMLElement | undefined = $state();

  /** 掴んでいるタブ。掴んでいなければ `null`。 */
  let dragging = $state<number | null>(null);
  let startX = 0;
  /**
   * しきい値を超えたか。超えていなければ、離した時点でクリックとして扱う。
   *
   * ルーンにしてあるのは、掴んでいる表示（`mx-tab--dragging`）がこの値を見るためである。
   */
  let moved = $state(false);

  /**
   * 掴む。**左ボタンだけ。**
   *
   * ポインタを捕捉するのは、タブが並べ替えでポインタの下から動くためである。
   * 捕捉しないと、動いた瞬間に別の要素へイベントが移り、そこで並べ替えが止まる。
   */
  function grab(event: PointerEvent, tab: Tab): void {
    if (event.button !== 0) return;
    dragging = tab.id;
    startX = event.clientX;
    moved = false;
    if (event.currentTarget instanceof HTMLElement) event.currentTarget.setPointerCapture(event.pointerId);
  }

  /** 並べ替える。1 ピクセルごとに呼ばれるが、位置が変わらなければ `moveTab` が何もしない。 */
  function drag(event: PointerEvent): void {
    if (dragging === null) return;
    if (!moved && Math.abs(event.clientX - startX) < DRAG_THRESHOLD) return;
    moved = true;
    // 窓の外へ出ている間は並べ替えない。
    // 出た先には落とす位置が無く、戻ってきたときに並びが変わっているほうが分かりにくい。
    if (outside(event)) return;
    moveTab(dragging, indexAt(event.clientX));
  }

  /**
   * ポインタがこのウィンドウの外か（F-OPEN-06 / タブのドラッグアウト）。
   *
   * 比べるのはスクリーン座標である。
   * `screenX` / `screenY` は本文の描画領域（ビューポート）の左上を基準にした座標系と同じ単位で、表示倍率（`--mx-zoom`）は CSS 変数であってページのズームではないため影響しない。
   */
  function outside(event: PointerEvent): boolean {
    return (
      event.screenX < globalThis.screenX ||
      event.screenY < globalThis.screenY ||
      event.screenX > globalThis.screenX + globalThis.innerWidth ||
      event.screenY > globalThis.screenY + globalThis.innerHeight
    );
  }

  /**
   * 離す。表示の切り替えはここで行わない。
   *
   * 切り替えは `click` に任せる。ポインタで処理してしまうと、`<button>` を
   * キーボード（Enter / Space）で押したときに何も起きなくなる。
   * `moved` は残す。直後に来る `click` を握り潰す判断に使う。
   *
   * 窓の外で離した場合は、そのタブをサテライトへ切り離す（F-OPEN-06）。
   * ポインタを捕捉してあるため、窓の外へ出た後もこのイベントは届く。
   */
  function release(event: PointerEvent): void {
    if (dragging === null) return;

    const id = dragging;
    // 窓の外で離したら切り離す（F-OPEN-06）。掴んで動かしていない押下は対象にしない。
    const detach = moved && outside(event);

    if (event.currentTarget instanceof HTMLElement && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragging = null;

    if (detach) {
      void moveTabToSatellite(id, {
        x: event.screenX - DETACH_OFFSET_X,
        y: event.screenY - DETACH_OFFSET_Y,
      });
    }
  }

  /**
   * そのタブを表示する。
   *
   * 並べ替えた直後の `click` では切り替えない。
   * 掴んで動かした結果として押されたことになるだけで、押す意図があったわけではない。
   * `moved` は次に掴んだ時点で戻る（`grab`）。
   */
  function activate(tab: Tab): void {
    if (moved) {
      moved = false;
      return;
    }
    void activateTab(tab.id);
  }

  /**
   * その X 座標に来るべき位置（0 始まり）。
   *
   * 各タブの中心と比べる。掴んでいるタブ自身も並びの中にあるため、
   * 半分を越えた時点で入れ替わり、そのまま押し続ければ隣へ移り続ける。
   */
  function indexAt(x: number): number {
    const items = [...(strip?.querySelectorAll('.mx-tab') ?? [])];
    const found = items.findIndex((item) => {
      const rect = item.getBoundingClientRect();
      return x < rect.left + rect.width / 2;
    });
    return found === -1 ? items.length - 1 : found;
  }

  /**
   * 表示する名前。無題の文書（`Ctrl+N`）にはパスが無い。
   *
   * ディレクトリは出さない。
   * 同名のファイルを見分ける手段は `title`（ツールチップ）に寄せ、横幅は枚数のために使う。
   */
  function nameOf(tab: Tab): string {
    const path = tabMeta(tab).path;
    return path === null ? ja.titlebar.untitled : splitPath(path).name;
  }

  /** 右クリックメニューを開いているか。閉じているあいだはチャンクも取得しない。 */
  let menuOpen = $state(false);

  /**
   * メニューの対象。**閉じるときに `null` へ戻さない。**
   *
   * 戻すと、`{#if}` が解体されるより先に props が読み直され、`target.tabId` が `null` に対する参照になって落ちる。
   * 開いているかどうかは `menuOpen` だけが表しており、閉じた後に残る値は次に開いたときに上書きされる。
   *
   * 押した位置を覚えるのは、メニューをそこへ出すためである。
   * キーボード（`Shift+F10` / メニューキー）で開いた場合はブラウザがタブの矩形を座標として渡す。
   */
  let menuTarget = $state<{ tabId: number; name: string; x: number; y: number } | null>(null);

  /** メニューを閉じたときにフォーカスを戻す先。 */
  let menuOpener: HTMLElement | null = null;

  function openMenu(event: MouseEvent, tab: Tab): void {
    event.preventDefault();
    menuOpener = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    menuTarget = { tabId: tab.id, name: nameOf(tab), x: event.clientX, y: event.clientY };
    menuOpen = true;
  }

  /**
   * 閉じる。既定ではタブへフォーカスを戻す。
   *
   * 戻さないと、`Esc` で閉じた時点でフォーカスが `<body>` へ移り、キーボード操作での現在位置が分からなくなる
   * （`app/MenuButton.svelte` と同じ判断）。
   */
  function closeMenu(refocus = true): void {
    menuOpen = false;
    if (refocus) menuOpener?.focus();
    menuOpener = null;
  }
</script>

<div class="mx-tabs" role="tablist" aria-label={ja.tab.list} bind:this={strip}>
  {#each tabsStore.tabs as tab (tab.id)}
    {@const name = nameOf(tab)}
    {@const active = tab.id === tabsStore.activeId}
    <div class="mx-tab" class:mx-tab--active={active} class:mx-tab--dragging={dragging === tab.id && moved}>
      <button
        type="button"
        class="mx-tab__label"
        role="tab"
        aria-selected={active}
        title={tabMeta(tab).path ?? name}
        onclick={() => activate(tab)}
        oncontextmenu={(event) => openMenu(event, tab)}
        onpointerdown={(event) => grab(event, tab)}
        onpointermove={drag}
        onpointerup={release}
        onpointercancel={release}
      >
        <span class="mx-tab__name">{name}</span>
        {#if isTabDirty(tab)}
          <span class="mx-tab__dirty" aria-label={ja.save.dirtyLabel}>●</span>
        {/if}
      </button>
      <button
        type="button"
        class="mx-tab__close"
        title={ja.tab.close(name)}
        aria-label={ja.tab.close(name)}
        onclick={() => void closeTab(tab.id)}
      >
        ✕
      </button>
    </div>
  {/each}
</div>

<!--
  中身は右クリックされるまでロードしない（`Explorer.svelte` のファイルツリーと同じ形）。
  取得が終わるまでは何も描かない。待っている 1 フレームに枠だけが出るほうが、位置がずれて見える。
-->
{#if menuOpen && menuTarget}
  {@const target = menuTarget}
  {#await import('./lazy/TabMenu.svelte') then { default: TabMenu }}
    <TabMenu tabId={target.tabId} name={target.name} x={target.x} y={target.y} onclose={closeMenu} />
  {/await}
{/if}

<style>
  /*
   * 枚数が増えたら横へスクロールさせる。
   * 幅を等分すると、2 枚のときと 10 枚のときで同じタブの位置が変わり、位置で覚えられなくなる。
   */
  .mx-tabs {
    display: flex;
    align-items: stretch;
    min-width: 0;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .mx-tabs::-webkit-scrollbar {
    display: none;
  }

  .mx-tab {
    display: flex;
    align-items: center;
    max-width: 14rem;
    border-right: 1px solid var(--mx-color-border-subtle);
    color: var(--mx-color-fg-muted);
  }

  /*
   * 選択中のタブは本文と地続きに見せる。
   * 下線ではなく背景で表すのは、タイトルバーの下端が本文との境界線になっているためである。
   */
  .mx-tab--active {
    background: var(--mx-color-bg);
    color: var(--mx-color-fg);
  }

  .mx-tab__label {
    display: flex;
    /* 掴んで横へ動かす操作を、タッチのスクロールに取られないようにする（並べ替え）。 */
    touch-action: none;
    align-items: center;
    gap: var(--mx-space-1);
    min-width: 0;
    padding: 0 var(--mx-space-1) 0 var(--mx-space-2);
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    line-height: var(--mx-titlebar-height);
    cursor: pointer;
  }

  .mx-tab__name {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  /*
   * 掴んでいる最中。位置は並びそのものが変わることで表すため、要素は動かさない。
   * 掴んでいることだけが分かればよい。
   */
  .mx-tab--dragging {
    opacity: 0.6;
  }

  /* 未保存の印。タイトルバーの `●` と同じ扱い（気づく程度の強さがあればよい）。 */
  .mx-tab__dirty {
    color: var(--mx-color-fg-muted);
    font-size: 10px;
    line-height: 1;
  }

  /*
   * 閉じるボタンは常に置く。
   * ホバーしたときだけ現れる形にすると、押せる位置が事前に分からず、タブの幅も変わる。
   */
  .mx-tab__close {
    display: flex;
    align-items: center;
    padding-inline: var(--mx-space-1);
    border: 0;
    background: none;
    color: var(--mx-color-fg-subtle);
    font: inherit;
    font-size: 10px;
    line-height: var(--mx-titlebar-height);
    cursor: pointer;
  }

  .mx-tab__close:hover {
    color: var(--mx-color-fg);
  }
</style>
