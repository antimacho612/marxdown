<!--
  タブストリップ（F-NAV-01, 02 / 03.ux-spec/01-screen-layout.md §2）。
  タイトルバーの中央領域（`TitleBar.svelte` の `center`）に差し込まれる。

  **2 枚以上のときしか描かれない。** 出し分けは差し込む側（`app/App.svelte`）が行う。
  1 枚のときはタイトルバーが既定のファイル名表示のままであり、この経路を通らない（§1「タブも 1 枚のうちは出さない」）。

  タブそのものはボタンで構成する。
  タイトルバーは `data-tauri-drag-region="deep"` でネイティブドラッグを掴む領域だが、`<button>` は自動的に除外されるため、タブを押しても窓が動かない。
  逆にタブが並んでいない余白は掴めるままになる。

  並べ替えはポインタイベントで行う（F-NAV-02）。
  HTML5 の drag イベントは使えない。ドロップされたファイルの絶対パスを受け取るために `disable_drag_drop_handler()` を呼べず（`04.tech-stack/06-rust.md` §6）、ネイティブのハンドラが有効な状態では WebView2 がページ内のドラッグも受け取るためである。
-->
<script lang="ts">
  import { ja } from '@/i18n/ja';
  import CloseIcon from '@/lib/CloseIcon.svelte';
  import { splitPath } from '@/lib/path';

  import { activateTab, closeTab, isTabDirty, moveTab, tabMeta, tabsStore, type Tab } from './tabs.svelte';

  /** 並べ替えと判断するまでの移動量（px）。押し込みの手ぶれで並びが変わらないようにする。 */
  const DRAG_THRESHOLD = 6;

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
    moveTab(dragging, indexAt(event.clientX));
  }

  /**
   * 離す。表示の切り替えはここで行わない。
   *
   * 切り替えは `click` に任せる。ポインタで処理してしまうと、`<button>` を
   * キーボード（Enter / Space）で押したときに何も起きなくなる。
   * `moved` は残す。直後に来る `click` を握り潰す判断に使う。
   */
  function release(event: PointerEvent): void {
    if (dragging === null) return;
    if (event.currentTarget instanceof HTMLElement && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragging = null;
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
   * 隠れている側。`''` は溢れていない。
   *
   * スクロールバーは出さない（タイトルバーの高さに収まらない）。
   * 代わりに隠れている側の端をぼかす。手がかりが無いと、溢れたタブは存在しないのと同じになる。
   */
  let overflow = $state<'' | 'start' | 'end' | 'both'>('');

  /** 端 1px の差は、ブラウザ側の丸めで溢れていなくても残る。判定から外す。 */
  const OVERFLOW_EPSILON = 1;

  function measureOverflow(): void {
    if (!strip) return;
    const start = strip.scrollLeft > OVERFLOW_EPSILON;
    const end = strip.scrollLeft + strip.clientWidth < strip.scrollWidth - OVERFLOW_EPSILON;
    overflow = start && end ? 'both' : start ? 'start' : end ? 'end' : '';
  }

  /**
   * 幅が変わったときの再判定。
   *
   * `scroll` はテンプレート側で拾う。ポーリングはしない（アイドル時 CPU ≒ 0）。
   */
  $effect(() => {
    if (!strip) return;
    const observer = new ResizeObserver(() => measureOverflow());
    observer.observe(strip);
    return () => observer.disconnect();
  });

  /**
   * タブが増減したときと、表示するタブが変わったときの追従。
   *
   * `Ctrl+Tab` や `Ctrl+N` で溢れた先へ移ると、強調されたタブが画面外に残る。
   * 実測では 21 枚のとき `scrollWidth 1205` に対して表示幅 604 で、アクティブなタブは x=1200 にあった。
   * どれを編集しているのかが分からなくなるため、見える位置へ寄せる。
   */
  $effect(() => {
    const count = tabsStore.tabs.length;
    const active = tabsStore.activeId;
    if (count === 0 || active === null) return;
    // `block: 'nearest'` を外さないこと。縦に動かす余地は無く、外すと本文側がスクロールする。
    strip?.querySelector('.mx-tab--active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    measureOverflow();
  });

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
</script>

<div
  class="mx-tabs"
  role="tablist"
  aria-label={ja.tab.list}
  data-mx-overflow={overflow || undefined}
  bind:this={strip}
  onscroll={measureOverflow}
>
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
        <CloseIcon size={10} />
      </button>
    </div>
  {/each}
</div>

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

  /*
   * 溢れの手がかり。隠れている側の端をぼかす。
   * スクロールバーを出さない以上、手がかりが無ければ溢れたタブは存在しないのと同じになる。
   */
  .mx-tabs[data-mx-overflow='end'] {
    mask-image: linear-gradient(to right, #000 calc(100% - 24px), transparent);
  }

  .mx-tabs[data-mx-overflow='start'] {
    mask-image: linear-gradient(to left, #000 calc(100% - 24px), transparent);
  }

  .mx-tabs[data-mx-overflow='both'] {
    mask-image: linear-gradient(to right, transparent, #000 24px, #000 calc(100% - 24px), transparent);
  }

  .mx-tab {
    display: flex;
    align-items: center;
    max-width: 14rem;
    border-right: 1px solid var(--mx-color-border-subtle);
    color: var(--mx-color-fg-muted);
  }

  .mx-tab:hover {
    background: var(--mx-color-bg-hover);
    color: var(--mx-color-fg);
  }

  /*
   * 選択中のタブは本文と地続きに見せる。
   *
   * 背景だけでは足りない。`bg` と `bg-subtle` の差は 1.07:1 しかなく、
   * 21 枚並べるとどれが開いているのか判別できなかった。
   * 一覧の現在位置と同じ印（`--mx-current-marker-block`）を上端に足す。
   * 下端ではなく上端なのは、タイトルバーの下端が本文との境界線として既に使われているため。
   */
  .mx-tab--active,
  .mx-tab--active:hover {
    background: var(--mx-color-bg);
    box-shadow: var(--mx-current-marker-block);
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
    font-size: var(--mx-font-size-ui-xs);
    line-height: 1;
  }

  /*
   * 閉じるボタンは常に置く。
   * ホバーしたときだけ現れる形にすると、押せる位置が事前に分からず、タブの幅も変わる。
   */
  .mx-tab__close {
    display: flex;
    align-items: center;
    /* タイトルバーの高さいっぱいを取る。押せる高さを字面ぶんに狭めない。 */
    align-self: stretch;
    padding-inline: var(--mx-space-1);
    border: 0;
    border-radius: var(--mx-radius-sm);
    background: none;
    color: var(--mx-color-fg-subtle);
    font: inherit;
    cursor: pointer;
  }

  .mx-tab__close:hover {
    background: var(--mx-color-bg-hover);
    color: var(--mx-color-fg);
  }

  .mx-tab__close:active {
    background: var(--mx-color-bg-inset);
  }

  /*
   * フォーカスリングを明示する。
   * 既定のリングのままだと、ここだけ他の部品（2px の実線・内側寄せ）と違う描かれ方になる。
   */
  .mx-tab__label:focus-visible,
  .mx-tab__close:focus-visible {
    outline: 2px solid var(--mx-color-accent);
    outline-offset: -2px;
  }
</style>
