<!--
  アウトライン（F-VIEW-02 / 03.ux-spec/06-panes.md §2）。
  データは `documentStore.outline` に既に入っており（`markdown/plugins/line-map.ts`）、ここは UI と追従だけを持つ。

  `<ul>` の入れ子にはせず平らな 1 枚のリストにし、段差はインデントで描く（見出し数百個の文書で入れ子にすると 1 項目あたりの DOM が増えるため）。
  階層は `role="tree"` + `aria-level` で伝わるので支援技術から見た構造は失われない。
-->
<script lang="ts">
  import { untrack } from 'svelte';

  import { documentStore, refreshOutlineOnOpen } from '@/features/document';
  import { settingsStore } from '@/features/settings';
  import { viewStore } from '@/features/view';
  import { ja } from '@/i18n/ja';
  import { registerOutlineRefresher, setOutlineOnScreen } from '@/lib/refresh';
  import type { OutlineItem } from '@/markdown/plugins/line-map';

  import { followHeadings, headingAtLine } from './follow';
  import { jumpToHeading } from './jump';
  import { registerOutlineFocus } from './show';

  /** アウトラインの 1 項目。元の `items` 上の位置と、インデント用の相対深さを添える。 */
  interface Row {
    item: OutlineItem;
    index: number;
    depth: number;
  }

  const PREVIEW_SELECTOR = '#mx-preview';

  /**
   * これ以下の見出し数では自動的に折りたたむ（§2 / Defaults Matter）。
   *
   * 見出しが 2 個の目次では、本文を 1 画面スクロールすれば得られる以上の情報がない。
   * 領域は占有させないが、開く手段は残す。
   */
  const AUTO_COLLAPSE_MAX = 2;

  const items = $derived(documentStore.outline);
  const depths = $derived(toDepths(items));

  /**
   * 表示する見出しの最大階層（設定 #61）。
   *
   * `depths` ではなく `item.level`（`h1`〜`h6`）で比較する。
   * `depths` は文書ごとに最浅見出しを 0 とする相対値であり、同じ設定値でも文書によって切れる位置が変わってしまう。
   */
  const maxDepth = $derived(settingsStore.values['outline.maxDepth']);

  /** 深さで絞った後の行。インデントは絞り込み前の `depths` をそのまま使う（絞るたびに詰め直さない）。 */
  const rows = $derived(
    items
      .map((item, index): Row => ({ item, index, depth: depths[index] ?? 0 }))
      .filter((row) => row.item.level <= maxDepth),
  );

  /**
   * 追う相手がプレビューではなくエディターか（#59）。
   *
   * Edit では本文の面が `display: none` になっている。
   * 非表示の要素では交差が発生しないため、`IntersectionObserver` から現在位置を得られない
   * （`rootBounds` も `boundingClientRect` もすべて 0 で届き、すべての見出しが通過済みと判定される）。
   * 表示されているのはエディター側であるため、そちらのカーソル行から求める。
   */
  const followsCursor = $derived(viewStore.mode === 'edit');

  /** 現在位置（`items` の添字）。本文のスクロールに追従する。 */
  let activeIndex = $state(-1);

  /**
   * 手で開閉したときの選択。`null` は「自動判断に任せる」。
   *
   * 別のドキュメントを開いたら捨てる。見出しの数が変われば、
   * 折りたたむべきかどうかの判断も変わる。
   */
  let manualExpanded = $state<boolean | null>(null);

  const expanded = $derived(manualExpanded ?? rows.length > AUTO_COLLAPSE_MAX);

  let list: HTMLElement | null = $state(null);
  let section: HTMLElement | null = $state(null);

  /** 最後に見たファイル。開き直し（`F5`）で手動の開閉を捨てないための目印。 */
  let seenPath: string | null = null;

  $effect(() => {
    const path = documentStore.meta?.path ?? null;
    if (path === seenPath) return;
    seenPath = path;
    manualExpanded = null;
  });

  /**
   * 本文のスクロールへの追従（N-PERF-05）。
   *
   * ペインを閉じるとこのコンポーネント自体が破棄されるため、観測も同時に停止する。
   * 閉じている間のコストは発生しない。
   */
  $effect(() => {
    // `items` を読むこと自体が依存の宣言になる。別の本文になったら張り直す。
    const total = items.length;
    // Edit ではプレビューが非表示であり、観測しても正しい結果が得られない。
    if (followsCursor) return;

    activeIndex = -1;
    const container = document.querySelector<HTMLElement>(PREVIEW_SELECTOR);
    // 見出しが 1 つも無ければ追従対象が存在しないため、観測を開始しない
    if (!container || total === 0) return;

    const follower = followHeadings(container, (index) => {
      activeIndex = index;
    });

    // 段階的描画で後から入るチャンクの見出しを拾う（`open.ts` が呼ぶ）。
    registerOutlineRefresher(follower.refresh);

    return () => {
      registerOutlineRefresher(null);
      follower.stop();
    };
  });

  /**
   * Edit での現在位置。カーソルのある行を含む見出しを示す（VS Code のアウトラインと同じ）。
   *
   * カーソル位置は既にストアへ反映されている（`features/editor/lazy/cursor.ts` が rAF で間引いて設定する / ADR-0005）。
   * 購読を追加せずに済むため、ペインを閉じてもエディター側に解除漏れが残らない。
   */
  $effect(() => {
    if (!followsCursor) return;
    // 1 始まり。`OutlineItem.line` は 0 始まり（`line-map.ts`）。
    const line = documentStore.cursor?.line ?? 1;
    activeIndex = headingAtLine(items, line);
  });

  /**
   * アウトラインが表示されていることを登録する（`lib/refresh.ts`）。
   *
   * Edit では、表示されている間だけ見出しを取り直すためのパースが実行される。
   * 開いた時点の見出しは打鍵の回数だけ古くなっているため、1 回取り直してから開始する。
   */
  $effect(() => {
    setOutlineOnScreen(true);
    // `untrack` を外さないこと。
    // この先で `viewStore.mode` を読むため、そのまま呼ぶとモードを切り替えるたびにこの効果が再登録される
    // （変化していない見出しのためにパースが 1 回実行されることになる）。
    untrack(() => void refreshOutlineOnOpen());
    return () => setOutlineOnScreen(false);
  });

  /** `Ctrl+Shift+U` の着地点（§4）。現在位置があればそこ、無ければ先頭。 */
  $effect(() => {
    registerOutlineFocus(() => {
      const target = list?.querySelector<HTMLElement>('[aria-current="true"]') ?? list?.querySelector('button');
      if (target) target.focus();
      // 見出しが 1 つも無い / 折りたたまれている場合は、見出し行に着地させる。
      // フォーカスが `<body>` へ落ちると、キーボードだけの人が現在地を見失う。
      else section?.focus();
    });
    return () => registerOutlineFocus(null);
  });

  /**
   * 現在位置に対応する行。深さで絞られて非表示になっている場合は、直近の可視な祖先を代わりに示す
   * （VS Code のアウトラインで折りたたんだ節の親がハイライトされるのと同じ扱い）。
   *
   * `rows` は文書の並び順を保っているので、`activeIndex` 以前で最後に見つかった行が祖先にあたる。
   */
  const highlightIndex = $derived(nearestVisibleIndex(rows, activeIndex));

  function nearestVisibleIndex(list: Row[], active: number): number {
    if (active < 0) return -1;
    let found = -1;
    for (const row of list) {
      if (row.index > active) break;
      found = row.index;
    }
    return found;
  }

  /** 現在位置が動いたら、ペインの中でも見えるところへ寄せる。 */
  $effect(() => {
    if (highlightIndex < 0 || !expanded) return;
    const position = rows.findIndex((row) => row.index === highlightIndex);
    list?.querySelectorAll('button')[position]?.scrollIntoView({ block: 'nearest' });
  });

  /**
   * 深さに変換する。文書内で最も浅い見出しを 0 とする。
   *
   * `h2` から始まる文書（Front Matter に題を書く書き方）で、全体が 1 段下がって表示されるのを避ける。
   */
  function toDepths(list: OutlineItem[]): number[] {
    if (list.length === 0) return [];
    let min = 6;
    for (const item of list) min = Math.min(min, item.level);
    return list.map((item) => Math.min(item.level - min, 5));
  }

  /**
   * 上下キーで項目を移動する（03.ux-spec/10-accessibility.md「すべての操作がキーボードで到達可能」）。
   *
   * `role="tree"` に対して WAI-ARIA が定めている操作である。
   * Tab で 1 項目ずつ移動させると、見出しが数百個ある文書ではペインから抜けられなくなる。
   */
  function onKeyDown(event: KeyboardEvent): void {
    const buttons = [...(list?.querySelectorAll<HTMLElement>('button') ?? [])];
    const current = buttons.indexOf(document.activeElement as HTMLElement);
    if (current < 0) return;

    const next =
      event.key === 'ArrowDown'
        ? current + 1
        : event.key === 'ArrowUp'
          ? current - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? buttons.length - 1
              : -1;
    if (next < 0 || next >= buttons.length) return;

    buttons[next]?.focus();
    event.preventDefault();
  }
</script>

<section class="mx-outline" bind:this={section} tabindex="-1" aria-label={ja.outline.title}>
  <!--
    見出し行。見出しが 1 つも無いときは操作可能にしない（折りたたむ対象が無いため）。
    Principle 3「押せないものを並べない」。
  -->
  <div class="mx-outline__head">
    {#if items.length === 0}
      <span class="mx-outline__title">{ja.outline.title}</span>
    {:else}
      <button
        type="button"
        class="mx-outline__toggle"
        aria-expanded={expanded}
        title={expanded ? ja.outline.collapse : ja.outline.expand}
        onclick={() => (manualExpanded = !expanded)}
      >
        <span class="mx-outline__twisty" aria-hidden="true">{expanded ? '▾' : '▸'}</span>
        <span class="mx-outline__title">{ja.outline.title}</span>
        <span class="mx-outline__count">{rows.length}</span>
      </button>
    {/if}
  </div>

  {#if items.length === 0}
    <!--
      §2「見出しが 1 つも無いドキュメントでは、ペインを開いていても空であることを明示する」。
      空白のままにすると「壊れている / まだ読み込んでいる」と読めてしまう。
    -->
    <p class="mx-outline__empty">
      {ja.outline.empty}
      <span class="mx-outline__hint">{ja.outline.emptyHint}</span>
    </p>
  {:else if expanded && rows.length === 0}
    <!-- 見出しはあるが、設定した深さより浅いものが 1 つも無い（例: 本文が h2 以下から始まる文書に「h1 まで」を指定した）。 -->
    <p class="mx-outline__empty">{ja.outline.filtered}</p>
  {:else if expanded}
    <!--
      `tabindex="-1"`: ツリー自身は Tab の順路に入らない。着地するのは
      現在位置の項目（`registerOutlineFocus`）で、そこから上下キーで動く。
    -->
    <div class="mx-outline__list" bind:this={list} role="tree" tabindex="-1" onkeydown={onKeyDown}>
      {#each rows as row (`${row.item.line}:${row.item.slug}`)}
        <button
          type="button"
          role="treeitem"
          aria-level={row.depth + 1}
          aria-selected={row.index === highlightIndex}
          aria-current={row.index === highlightIndex ? 'true' : undefined}
          style:padding-inline-start="calc(var(--mx-space-2) + {row.depth * 12}px)"
          title={row.item.text}
          onclick={() => jumpToHeading(row.item)}
        >
          {row.item.text}
        </button>
      {/each}
    </div>
  {/if}
</section>

<style>
  .mx-outline {
    display: flex;
    flex-direction: column;
    min-height: 0;
    flex: 1;
  }

  .mx-outline:focus-visible {
    outline: 2px solid var(--mx-color-accent);
    outline-offset: -2px;
  }

  /*
   * 見出し行。ペインの中の「章題」であって、本文ではない。
   * 03.ux-spec/01-screen-layout.md §2 の図に合わせて全角ではなく小さく詰めた大文字扱いにする。
   */
  .mx-outline__head {
    display: flex;
    flex: none;
    align-items: center;
    height: 28px;
    border-bottom: 1px solid var(--mx-color-border-subtle);
  }

  .mx-outline__toggle {
    display: flex;
    align-items: center;
    gap: var(--mx-space-1);
    width: 100%;
    height: 100%;
    padding-inline: var(--mx-space-2);
    border: none;
    background: none;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }

  .mx-outline__toggle:hover {
    background: var(--mx-color-bg-hover);
  }

  .mx-outline__toggle:focus-visible {
    outline: 2px solid var(--mx-color-accent);
    outline-offset: -2px;
  }

  .mx-outline__twisty {
    width: 1em;
    color: var(--mx-color-fg-subtle);
  }

  .mx-outline__title {
    padding-inline-start: var(--mx-space-2);
    color: var(--mx-color-fg-muted);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
  }

  .mx-outline__toggle .mx-outline__title {
    padding-inline-start: 0;
  }

  .mx-outline__count {
    margin-inline-start: auto;
    color: var(--mx-color-fg-subtle);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }

  .mx-outline__empty {
    display: flex;
    flex-direction: column;
    gap: var(--mx-space-1);
    margin: 0;
    padding: var(--mx-space-4) var(--mx-space-3);
    color: var(--mx-color-fg-muted);
  }

  .mx-outline__hint {
    color: var(--mx-color-fg-subtle);
    font-size: 11px;
  }

  .mx-outline__list {
    flex: 1;
    min-height: 0;
    padding-block: var(--mx-space-1);
    overflow-y: auto;
  }

  .mx-outline__list button {
    display: block;
    width: 100%;
    padding-block: 3px;
    padding-inline-end: var(--mx-space-2);
    border: none;
    background: none;
    color: var(--mx-color-fg-muted);
    font: inherit;
    text-align: start;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: pointer;

    /*
     * 見えていない項目のレイアウトと描画を飛ばす。
     *
     * `huge.md`（2MB / 見出し 1249 個）でペインを開いたときの強制レイアウトが
     * 実測 25〜43ms から 10〜16ms に落ちる。仮想スクロールを持ち込まずに
     * 長いリストを扱うための、CSS 1 行の代替（本文で仮想スクロールを
     * 採用しないのと同じ判断 / 02.architecture/06-markdown-rendering-pipeline.md §4）。
     *
     * `contain-intrinsic-size` は実測の行高（約 19px）。これが無いと
     * スクロールバーの長さが伸び縮みする。
     */
    content-visibility: auto;
    contain-intrinsic-size: auto 19px;
  }

  .mx-outline__list button:hover {
    background: var(--mx-color-bg-hover);
    color: var(--mx-color-fg);
  }

  .mx-outline__list button:focus-visible {
    outline: 2px solid var(--mx-color-accent);
    outline-offset: -2px;
  }

  /*
   * 現在位置は背景色ではなく左端の線で示す。
   * 本文と同じ背景の上で塗りを使うと、ペイン全体の見た目が煩雑になる（Principle 2 / 情報密度は高く、静かに）。
   */
  .mx-outline__list button[aria-current='true'] {
    box-shadow: inset 2px 0 0 var(--mx-color-accent);
    background: var(--mx-color-bg-inset);
    color: var(--mx-color-fg);
  }
</style>
