/**
 * タブ（F-NAV-01, 02 / 02.architecture/08-state-management.md §1）。
 *
 * UI はまだ無い（[06.roadmap > m3 §1.1](../../../docs/06.roadmap/m3-workspace.md) の Phase 2）。
 * ここにあるのはモデルと、開く・切り替える・閉じるの操作だけである。
 *
 * アクティブなタブは本文を持たない。
 * 本文の真実はエディターがマウントされていれば Monaco の `ITextModel`、そうでなければ `document/text.ts` であり、ここに複製すると 1 打鍵ごとに巨大な文字列がリアクティビティを通過する（ADR-0005）。
 * 抱えるのは非アクティブのタブだけで、切り替えのときに退避する。
 * この不変条件は `tabs.test.ts` が機械的に見張る。
 *
 * Preview の DOM は保持しない（M3 §1.1 の決定）。切り替えのたびに捨てて描き直す。
 * `readme.md` のパースは 0.32ms であり、枚数ぶんの積算が構造的に起きない形を先に選んでいる。
 *
 * Undo 履歴はまだ引き継がない。
 * タブごとの `ITextModel` を持つには破棄の設計（N-PERF-06 / Phase 3）と一体で決める必要があり、Phase 2 で入れる。
 */
import {
  documentStore,
  getDocumentText,
  isTextDirty,
  openDocument,
  openPath,
  previewScrollTop,
  setDirty,
  toMeta,
  type StoredMeta,
  type StoredPayload,
} from '@/features/document';
import type { Eol } from '@/platform';

/**
 * 1 枚のタブ。
 *
 * `id` で同一視する。パスは同一性に使えない（`Save As` で変わり、無題の文書では `null` になる）。
 */
export interface Tab {
  readonly id: number;
  meta: StoredMeta;
  /**
   * 退避してある本文。**アクティブなタブでは常に `null`。**
   *
   * 非アクティブのタブでも、ディスクと一致していて読み直せるものは持たない。
   * 枚数ぶんの本文を抱えると、開いたファイルの合計サイズがそのままメモリに積み上がる（N-PERF-06）。
   * 抱えるのは失うと戻せないもの、すなわち未保存の変更と無題の文書だけである。
   */
  text: string | null;
  /** Preview のスクロール位置。切り替えて戻ったときに同じ位置から読み始められるようにする。 */
  scrollTop: number;
  /** 本文がディスクと違うか。EOL の変換とは分けて持つ（`document/dirty.ts`）。 */
  textDirty: boolean;
  /** 保存時に書き戻す EOL の希望（F-EDIT-14）。 */
  eolOverride: Eol | null;
}

class TabsStore {
  tabs = $state<Tab[]>([]);
  activeId = $state<number | null>(null);

  /** いま表示しているタブ。1 枚も開いていなければ `null`（Welcome 画面）。 */
  get active(): Tab | null {
    return this.tabs.find((tab) => tab.id === this.activeId) ?? null;
  }
}

/** タブの一覧とアクティブなタブ。モジュールの singleton として共有する。 */
export const tabsStore = new TabsStore();

let nextId = 1;

/** 未保存の変更があるか。ダーティの源を合成した値で、タブに付ける印（`●`）はこれで決まる。 */
export function isTabDirty(tab: Tab): boolean {
  return tab.textDirty || tab.eolOverride !== null;
}

/**
 * 開けた文書をアクティブなタブへ反映する。`configureOpener` の `onOpened` から呼ばれる。
 *
 * 1 枚も無ければここで作る。
 * 起動経路（`app/bootstrap.ts`）に「最初のタブを作る」処理を置かずに済むようにしてあり、開いた結果が必ず 1 枚のタブとして現れる。
 *
 * 開いた直後はディスクと一致しているため、ダーティの源も退避してある本文も落とす。
 * 切り替えによる再表示でもここを通るが、その場合は直後に `activateTab` が退避した値を戻す。
 */
export function adoptOpened(meta: StoredMeta): void {
  const active = tabsStore.active;
  if (active === null) {
    const tab: Tab = { id: nextId++, meta, text: null, scrollTop: 0, textDirty: false, eolOverride: null };
    tabsStore.tabs = [...tabsStore.tabs, tab];
    tabsStore.activeId = tab.id;
    return;
  }

  active.meta = meta;
  active.text = null;
  active.textDirty = false;
  active.eolOverride = null;
}

/**
 * 新しいタブとして開く（Phase 2 の argv 転送・D&D・複数選択が使う）。
 *
 * 現在のタブは退避してから残す。
 * 未保存の確認（`confirmDiscard`）は通さない。捨てるものが無く、いまの内容はタブとして残るためである。
 */
export async function openInNewTab(payload: StoredPayload): Promise<boolean> {
  stashActive();

  const tab: Tab = {
    id: nextId++,
    meta: toMeta(payload),
    text: null,
    scrollTop: 0,
    textDirty: false,
    eolOverride: null,
  };
  tabsStore.tabs = [...tabsStore.tabs, tab];
  tabsStore.activeId = tab.id;

  return (await openDocument(payload, { resetScroll: true })) !== null;
}

/**
 * タブを切り替える。既にアクティブなら何もしない。
 *
 * 本文は、退避してあればそれを、無ければディスクから読み直す。
 * 読み直す側が既定なのは、クリーンなタブが本文を抱えないためである（`Tab.text`）。
 * 読み直しは外部変更を拾い直すことにもなる。監視は開いているファイルにしか掛かっていないため（N-PERF-05）、背後のタブは古くなりうる。
 */
export async function activateTab(id: number): Promise<boolean> {
  if (tabsStore.activeId === id) return true;

  const target = tabsStore.tabs.find((tab) => tab.id === id);
  if (target === undefined) return false;

  stashActive();

  // 開く前に移す。
  // `openDocument` は `onOpened` を通じて「アクティブなタブ」へ結果を書き戻すため、ここが古いままだと切り替え元のタブが上書きされる。
  tabsStore.activeId = id;

  // 退避してあった値は開く前に読む。
  // 開く途中で `adoptOpened` がこのタブを「開いた直後の状態」に落とすため、後から読むと消えている。
  const { text: held, textDirty, eolOverride, scrollTop } = target;

  const opened =
    held === null && target.meta.path !== null
      ? await openPath(target.meta.path, { resetScroll: false, restoreScroll: scrollTop, remember: false })
      : await openDocument(
          { ...target.meta, content: held ?? '' },
          { resetScroll: false, restoreScroll: scrollTop, remember: false },
        );

  if (opened === null) return false;

  // `openDocument` はディスクと一致した状態から始める（`markClean`）ので、ダーティは開いた後に戻す。
  // EOL の希望を先に戻すのは、`setDirty` が合成後の値を出し直すためである。順序が逆だと、本文だけがダーティなタブとして 1 度描かれる。
  documentStore.eolOverride = eolOverride;
  setDirty(textDirty);
  target.textDirty = textDirty;
  target.eolOverride = eolOverride;
  return true;
}

/**
 * タブを閉じる（F-NAV-02）。
 *
 * **最後の 1 枚は閉じない。**
 * 0 枚の状態は Welcome 画面（`App.svelte`）に戻ることを意味し、そこにはエディターとウォッチャの解放が伴う。
 * 解放は N-PERF-06 の担当であり、[M3](../../../docs/06.roadmap/m3-workspace.md) Phase 3 で入れる。
 *
 * 未保存の変更があっても尋ねない。
 * 尋ねるのは失う操作だけであり、その確認は Phase 2 で閉じる導線（`Ctrl+W`）と一緒に入れる。
 */
export async function closeTab(id: number): Promise<boolean> {
  if (tabsStore.tabs.length <= 1) return false;

  const index = tabsStore.tabs.findIndex((tab) => tab.id === id);
  if (index === -1) return false;

  const wasActive = tabsStore.activeId === id;
  const neighbor = tabsStore.tabs[index + 1] ?? tabsStore.tabs[index - 1];
  tabsStore.tabs = tabsStore.tabs.filter((tab) => tab.id !== id);

  // 閉じたのが表示中のタブなら、隣を表示する。
  // 閉じた側は既に一覧から外してあるので、退避（`stashActive`）は空振りする。
  if (wasActive && neighbor !== undefined) {
    tabsStore.activeId = null;
    return activateTab(neighbor.id);
  }
  return true;
}

/** テスト用。一覧と採番を初期状態に戻す。 */
export function resetTabs(): void {
  tabsStore.tabs = [];
  tabsStore.activeId = null;
  nextId = 1;
}

/**
 * 表示中の状態をアクティブなタブへ退避する。
 *
 * 本文を抱えるのは、失うと戻せないものだけである（`Tab.text`）。
 * ディスクと一致していて読み直せるものは捨てる。
 */
function stashActive(): void {
  const active = tabsStore.active;
  if (active === null) return;

  active.textDirty = isTextDirty();
  active.eolOverride = documentStore.eolOverride;
  active.scrollTop = previewScrollTop();
  active.text = isTabDirty(active) || active.meta.path === null ? getDocumentText() : null;
}
