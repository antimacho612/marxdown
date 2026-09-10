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
  closeDocument,
  confirmDiscard,
  disposeDocumentText,
  documentStore,
  getDocumentText,
  isTextDirty,
  openDocument,
  openPath,
  previewScrollTop,
  setDirty,
  toMeta,
  untitledPayload,
  type StoredMeta,
  type StoredPayload,
} from '@/features/document';
import { dropHistory } from '@/features/history';
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

  /**
   * `documentStore.meta` が実際にどのタブの内容と同期しているか。
   *
   * `activateTab` はディスクから読み直す間も先に `activeId` を新しいタブへ移すため（`activateTab` 内のコメント参照）、
   * 読み込みが終わるまで `documentStore.meta` は前のタブの値のままになる。
   * これが `activeId` と食い違っている間は `documentStore.meta` を信用しない（`tabMeta`）。
   */
  loadedId = $state<number | null>(null);

  /** いま表示しているタブ。1 枚も開いていなければ `null`（Welcome 画面）。 */
  get active(): Tab | null {
    return this.tabs.find((tab) => tab.id === this.activeId) ?? null;
  }
}

/** タブの一覧とアクティブなタブ。モジュールの singleton として共有する。 */
export const tabsStore = new TabsStore();

let nextId = 1;

/**
 * そのタブのメタ情報。
 *
 * アクティブかつ読み込みが終わっているタブだけはストアを見る。
 * `Save As`（`document/save.ts`）は保存先とサイズをストアへ直接書き戻すため、タブ側の値は古くなる。
 * 本文・ダーティと同じく、いま表示しているものの真実はタブの外にある（ADR-0005）。
 *
 * 古いまま使うと、切り替えて戻ったときに**保存前のファイルを開き直す**ことになる。
 * `loadedId` が無いと、切り替え直後の読み込み中に前のタブのメタ情報が新しいタブのものとして一瞬出る（#107）。
 */
export function tabMeta(tab: Tab): StoredMeta {
  if (tab.id !== tabsStore.activeId || tab.id !== tabsStore.loadedId) return tab.meta;
  return documentStore.meta ?? tab.meta;
}

/**
 * 未保存の変更があるか。タブに付ける印（`●`）と、閉じるときに尋ねるかはこれで決まる。
 *
 * アクティブかつ読み込みが終わっているタブだけはストアを見る。
 * タブ側の値は切り替えのときにしか更新されないため（`stashActive`）、打鍵しても古いままである。
 * 本文と同じく、いま表示しているものの真実はタブの外にある（ADR-0005）。
 */
export function isTabDirty(tab: Tab): boolean {
  if (tab.id === tabsStore.activeId && tab.id === tabsStore.loadedId) return documentStore.isDirty;
  return tab.textDirty || tab.eolOverride !== null;
}

/**
 * 開く先のタブ。**無ければここで作る**（`OpenerConfig.targetKey`）。
 *
 * 作る場面は起動直後の 1 枚目だけである。
 * 2 枚目以降はタブ側が先にアクティブを移してから開く（`activateTab` / `openPathInNewTab`）。
 * 中身は直後に `adoptOpened` が入れる。
 */
export function targetTabKey(): number {
  const active = tabsStore.active;
  if (active !== null) return active.id;

  const tab: Tab = {
    id: nextId++,
    meta: placeholder(''),
    text: null,
    scrollTop: 0,
    textDirty: false,
    eolOverride: null,
  };
  tabsStore.tabs = [...tabsStore.tabs, tab];
  tabsStore.activeId = tab.id;
  return tab.id;
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
    tabsStore.loadedId = tab.id;
    return;
  }

  active.meta = meta;
  active.text = null;
  active.textDirty = false;
  active.eolOverride = null;
  tabsStore.loadedId = active.id;
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
 * 無題の文書を新しいタブで開く（`Ctrl+N` / F-OPEN-03）。
 *
 * 開いた後に編集できるモードへ移すのは呼び出し側（`app/commands.ts`）である。
 * 空の本文は Preview では読めないが、モードの切り替えはこの feature の関心ではない。
 */
export async function openUntitledTab(): Promise<boolean> {
  return openInNewTab(untitledPayload());
}

/**
 * タブを切り替える。既にアクティブなら何もしない。
 *
 * 本文は、退避してあればそれを、無ければディスクから読み直す。
 * 読み直す側が既定なのは、クリーンなタブが本文を抱えないためである（`Tab.text`）。
 * 読み直しは外部変更を拾い直すことにもなる。監視は開いているファイルにしか掛かっていないため（N-PERF-05）、背後のタブは古くなりうる。
 *
 * 読み直せなかったタブ（外部で削除・リネームされたファイル）は取り除く（`dropUnopenable`）。
 */
export async function activateTab(id: number): Promise<boolean> {
  if (tabsStore.activeId === id) return true;

  const target = tabsStore.tabs.find((tab) => tab.id === id);
  if (target === undefined) return false;

  const previousId = tabsStore.activeId;
  stashActive();

  // 開く前に移す。
  // `openDocument` は `onOpened` を通じて「アクティブなタブ」へ結果を書き戻すため、ここが古いままだと切り替え元のタブが上書きされる。
  tabsStore.activeId = id;

  // 退避してあった値は開く前に読む。
  // 開く途中で `adoptOpened` がこのタブを「開いた直後の状態」に落とすため、後から読むと消えている。
  const { text: held, textDirty, eolOverride, scrollTop } = target;

  // 開く前の表示。開けなかったときに、表示が切り替わったかどうかを見分けるために持つ。
  const shown = documentStore.meta;

  const opened =
    held === null && target.meta.path !== null
      ? await openPath(target.meta.path, {
          resetScroll: false,
          restoreScroll: scrollTop,
          remember: false,
          // 捨てるものは無い。切り替え元はタブとして残る（`OpenOptions.confirm`）。
          confirm: false,
        })
      : await openDocument(
          { ...target.meta, content: held ?? '' },
          { resetScroll: false, restoreScroll: scrollTop, remember: false },
        );

  if (opened === null) {
    // 表示が切り替わっていれば、失敗したのは描画であり文書は載っている。タブはそのままにする。
    if (documentStore.meta !== shown) return false;
    await dropUnopenable(id, previousId);
    return false;
  }

  // `openDocument` はディスクと一致した状態から始める（`markClean`）ので、ダーティは開いた後に戻す。
  // EOL の希望を先に戻すのは、`setDirty` が合成後の値を出し直すためである。順序が逆だと、本文だけがダーティなタブとして 1 度描かれる。
  documentStore.eolOverride = eolOverride;
  setDirty(textDirty);
  target.textDirty = textDirty;
  target.eolOverride = eolOverride;
  return true;
}

/**
 * タブを閉じる（F-NAV-02 / `Ctrl+W`）。
 *
 * 未保存の変更があるタブは、**先にそのタブを表示してから**尋ねる。
 * 何を失うのかが見えない状態で「破棄しますか」と聞かれても答えられない。
 *
 * 最後の 1 枚を閉じると 0 枚になり、Welcome 画面へ戻る（`closeDocument`）。
 * プロセスは終わらない。`✕` が格納の意味になるトレイ常駐（ADR-0007）と揃えてある。
 */
export async function closeTab(id: number): Promise<boolean> {
  const index = tabsStore.tabs.findIndex((tab) => tab.id === id);
  const target = tabsStore.tabs[index];
  if (target === undefined) return false;

  if (isTabDirty(target)) {
    if (tabsStore.activeId !== id && !(await activateTab(id))) return false;
    if (!(await confirmDiscard())) return false;
  }

  const wasActive = tabsStore.activeId === id;
  rememberClosed(target, index);
  tabsStore.tabs = tabsStore.tabs.filter((tab) => tab.id !== id);

  // そのタブのために抱えているものを捨てる（N-PERF-06）。
  // エディターのモデル（Undo 履歴を含む）と、戻る / 進むの履歴が対象である。
  // 閉じたタブのぶんが残ると、常駐しているあいだ枚数分だけ積算する。
  disposeDocumentText(id);
  dropHistory(id);

  if (!wasActive) return true;

  // 右隣を表示する。右端を閉じたときだけ左隣になる（VS Code と同じ）。
  // 一覧から外した後なので、`index` は元の右隣を指している。
  const neighbor = tabsStore.tabs[index] ?? tabsStore.tabs[index - 1];
  tabsStore.activeId = null;

  if (neighbor === undefined) {
    closeDocument();
    return true;
  }
  return activateTab(neighbor.id);
}

/**
 * 直前に閉じたタブを開き直す（`Ctrl+Shift+T`）。
 *
 * 覚えているのはパスとスクロール位置だけである。
 * 未保存の内容は閉じるときに確認したうえで捨てているため、復元すると「捨てたはずのものが戻る」ことになる。
 */
export async function reopenClosedTab(): Promise<boolean> {
  const entry = closed.pop();
  if (entry === undefined) return false;
  // 閉じた位置へ戻す。末尾に付けると、開き直しただけで並びが変わる。
  return openPathInNewTab(entry.path, { scrollTop: entry.scrollTop, index: entry.index });
}

/**
 * パスを新しいタブで開く（argv 転送 / D&D / タブの復元）。
 *
 * 既に開いているファイルなら、そのタブへ切り替えるだけで開き直さない。
 * 同じファイルが 2 枚並ぶと、片方で編集して片方を保存したときにどちらが正しいのか決められなくなる。
 *
 * 先にタブの枠を作ってから開く。
 * 読み込みの失敗・通知・履歴からの除去は `openPath` に集約されているため（`document/open.ts`）、
 * ここで先に読んで枠を作る形にすると、その経路を迂回することになる。
 * 開けなかった場合は枠を捨てて元のタブへ戻す。
 */
export async function openPathInNewTab(
  path: string,
  options: { scrollTop?: number; index?: number; remember?: boolean } = {},
): Promise<boolean> {
  const existing = tabsStore.tabs.find((tab) => tabMeta(tab).path === path);
  if (existing !== undefined) return activateTab(existing.id);

  const previousId = tabsStore.activeId;
  stashActive();

  const scrollTop = options.scrollTop ?? 0;
  const tab: Tab = {
    id: nextId++,
    meta: placeholder(path),
    text: null,
    scrollTop,
    textDirty: false,
    eolOverride: null,
  };
  tabsStore.tabs = insertAt(tabsStore.tabs, tab, options.index);
  tabsStore.activeId = tab.id;

  const opened = await openPath(path, {
    // 捨てるものは無い。いまの文書はタブとして残る。
    confirm: false,
    resetScroll: scrollTop === 0,
    ...(scrollTop > 0 && { restoreScroll: scrollTop }),
    // 復元では最近開いたファイルを積み直さない（M3 Phase 7）。
    // 起動しただけで一覧が前回のタブで埋まると、「最後に開いた順」の意味が失われる。
    ...(options.remember === false && { remember: false }),
  });
  if (opened !== null) return true;

  // 開けなかった。表示は変わっていない（`openPath` は読み込みに失敗した時点で戻る）ので、枠を捨てて元へ戻す。
  tabsStore.tabs = tabsStore.tabs.filter((entry) => entry.id !== tab.id);
  restoreActive(previousId);
  return false;
}

/**
 * 落とされた / 転送されたファイルを順に開く（F-OPEN-08 / ADR-0004）。
 *
 * 直列に開く。並行にすると、どのタブがアクティブなのかを開く処理どうしが取り合う。
 * 最後に開けたものが表示された状態になる。
 */
export async function openPathsInTabs(paths: string[]): Promise<boolean> {
  let opened = false;
  for (const path of paths) {
    // eslint-disable-next-line no-await-in-loop -- 直列に開くこと自体が目的（上記）
    if (await openPathInNewTab(path)) opened = true;
  }
  return opened;
}

/**
 * タブを並べ替える（F-NAV-02）。`toIndex` は移動後の位置（0 始まり）。
 *
 * 端は丸める。掴んだまま行き過ぎたときに、並びが飛ぶより端で止まるほうが扱いやすい。
 * 動かなかったときは `false` を返す。ドラッグ中は 1 ピクセルごとに呼ばれるため、
 * 呼び出し側が「変わったか」を判断せずに済むようにしてある。
 */
export function moveTab(id: number, toIndex: number): boolean {
  const from = tabsStore.tabs.findIndex((tab) => tab.id === id);
  if (from === -1) return false;

  const to = Math.min(Math.max(toIndex, 0), tabsStore.tabs.length - 1);
  if (from === to) return false;

  const next = [...tabsStore.tabs];
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return false;
  next.splice(to, 0, moved);
  tabsStore.tabs = next;
  return true;
}

/** 次 / 前のタブ（`Ctrl+Tab` / `Ctrl+Shift+Tab`）。端では折り返す。 */
export async function cycleTab(delta: 1 | -1): Promise<boolean> {
  const count = tabsStore.tabs.length;
  if (count < 2) return false;

  const current = tabsStore.tabs.findIndex((tab) => tab.id === tabsStore.activeId);
  const next = tabsStore.tabs[(current + delta + count) % count];
  return next === undefined ? false : activateTab(next.id);
}

/**
 * n 番目のタブ（`Ctrl+1`〜`Ctrl+9`）。`index` は 1 始まり。
 *
 * 9 番目より後ろには行けない。VS Code の `Ctrl+9`（最後のタブ）とは違うが、
 * 03.ux-spec/04-keybindings.md §3 が「n 番目のタブ」と定めている。
 */
export async function selectTabAt(index: number): Promise<boolean> {
  const target = tabsStore.tabs[index - 1];
  return target === undefined ? false : activateTab(target.id);
}

/** テスト用。一覧と採番を初期状態に戻す。 */
export function resetTabs(): void {
  tabsStore.tabs = [];
  tabsStore.activeId = null;
  tabsStore.loadedId = null;
  closed.length = 0;
  nextId = 1;
}

/**
 * 開けなかったタブを取り除き、表示と一致した状態へ戻す（#106）。
 *
 * 外部で削除・リネームされたファイルのタブがこれにあたる。
 * クリーンなタブは本文を抱えないため（`Tab.text`）、読み直せないタブに表示できる中身はどこにも無い。
 * 残したままアクティブにすると、表示は切り替え元のまま、タブの見出し・エディター・保存先だけが移った状態になる。
 *
 * `previousId` は切り替え元のタブ。閉じた直後の隣を開こうとした場合だけ `null` になり、そのときは戻る先が無い。
 */
async function dropUnopenable(id: number, previousId: number | null): Promise<void> {
  const index = tabsStore.tabs.findIndex((tab) => tab.id === id);
  tabsStore.tabs = tabsStore.tabs.filter((tab) => tab.id !== id);

  // 閉じるときと同じ後始末（N-PERF-06）。
  disposeDocumentText(id);
  dropHistory(id);

  // 切り替え元が残っていれば、そこへ戻すだけで表示と一致する。
  if (previousId !== null && tabsStore.tabs.some((tab) => tab.id === previousId)) {
    restoreActive(previousId);
    return;
  }

  // 戻る先が無い。表示は閉じた文書のままなので（`closeTab`）、別の隣を試す。
  const neighbor = tabsStore.tabs[index] ?? tabsStore.tabs[index - 1];
  if (neighbor !== undefined) {
    await activateTab(neighbor.id);
    return;
  }

  // 開けるタブが 1 枚も残らなかった。何も開いていない状態（Welcome）へ戻す。
  restoreActive(null);
  closeDocument();
}

/**
 * 表示中の文書のタブをアクティブに戻す。開く操作が表示を変えずに失敗したときに使う。
 *
 * 退避してあった本文は落とす。アクティブなタブは本文を持たない（`Tab.text`）。
 */
function restoreActive(id: number | null): void {
  tabsStore.activeId = id;
  const active = tabsStore.active;
  if (active !== null) active.text = null;
}

/**
 * 直前に閉じたタブ（`Ctrl+Shift+T`）。新しいものが末尾。
 *
 * 上限を置くのは、常駐で日をまたいで使うためである（ADR-0007）。
 * 復元できるのは直前の数枚で足り、それ以前は「最近開いたファイル」（F-OPEN-09）の担当になる。
 */
const closed: { path: string; scrollTop: number; index: number }[] = [];

const CLOSED_KEPT = 10;

/** 閉じたタブを覚える。パスを持たない無題の文書は開き直せないので覚えない。 */
function rememberClosed(tab: Tab, index: number): void {
  const path = tabMeta(tab).path;
  if (path === null) return;
  closed.push({ path, scrollTop: tab.scrollTop, index });
  if (closed.length > CLOSED_KEPT) closed.shift();
}

/** 指定の位置に入れる。位置が無ければ末尾。 */
function insertAt(tabs: Tab[], tab: Tab, index: number | undefined): Tab[] {
  if (index === undefined || index >= tabs.length) return [...tabs, tab];
  return [...tabs.slice(0, index), tab, ...tabs.slice(index)];
}

/**
 * 開く前のタブが持つメタ情報。
 *
 * 開けた時点で `adoptOpened` が本物に差し替える。
 * 枠を先に作るのは、読み込みの間もタブとして見えているようにするためである。
 */
function placeholder(path: string): StoredMeta {
  return { path, eol: 'lf', bom: false, encoding: 'utf8', mtimeMs: 0, size: 0, readonly: false };
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

  // `Save As` でストア側だけが新しくなっていることがある（`tabMeta`）。
  active.meta = tabMeta(active);
  active.textDirty = isTextDirty();
  active.eolOverride = documentStore.eolOverride;
  active.scrollTop = previewScrollTop();
  active.text = isTabDirty(active) || active.meta.path === null ? getDocumentText() : null;
}
