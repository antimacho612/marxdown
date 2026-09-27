/**
 * リンク遷移の履歴（F-NAV-07）。
 * 相対リンクでアプリ内を辿るだけでは戻れないため、ブラウザと同じ形（カーソル + 分岐で切り捨て）で `open.ts` を通ったドキュメントの切り替えだけを記録する。
 *
 * 再読み込み（同じ場所に留まる操作）は記録しない。記録すると `Alt+←` で同じ文書に戻るだけの段が挟まる。
 * ページ内アンカーも記録しない。
 * アウトラインは読みながら何度も押す道具でブラウザのアンカーリンクより押される回数が桁違いに多く、離れる直前のスクロール位置は各エントリが持つため記録しなくても復元は成立する。
 *
 * 実際に開き直すのは `navigate.ts`。
 * このモジュールは配列とカーソルだけを扱い、`open.ts` との循環参照を避ける。
 */

/** 履歴 1 件。 */
export interface HistoryEntry {
  /** 正規化済み絶対パス（Rust から返ってきた形）。 */
  path: string;
  /** そこを離れる直前のスクロール位置。戻ってきたときに復元する。 */
  scrollTop: number;
}

/**
 * 保持する件数。
 *
 * 常駐アプリ（ADR-0007）であるため、上限が無いと長時間の使用で件数が増え続ける。
 * 保持するのはパスと数値だけであり、50 件でも数 KB に収まる。
 */
const LIMIT = 50;

/** タブ 1 枚ぶんの履歴。 */
interface TabHistory {
  entries: HistoryEntry[];
  /** いま見ているエントリの添字。何も開いていなければ `-1`。 */
  cursor: number;
}

/**
 * タブごとの履歴。
 *
 * 1 本を共有すると、タブを切り替えた後の `Alt+←` が別のタブで開いた文書へ移動する。
 * 戻る先は「同じタブの 1 つ前」であってほしい。ブラウザのタブと同じ形である。
 */
const byTab = new Map<number, TabHistory>();

function stateOf(key: number): TabHistory {
  const found = byTab.get(key);
  if (found) return found;
  const created: TabHistory = { entries: [], cursor: -1 };
  byTab.set(key, created);
  return created;
}

/**
 * 開いたドキュメントを記録する。離れる直前のスクロール位置も併せて受け取る。
 *
 * 現在位置より先（`Alt+←` で戻った後の「進む」側）は破棄する。
 * ブラウザと同じく、戻ってから別の場所へ移動すれば分岐は失われる。
 */
export function pushHistory(key: number, path: string, currentScrollTop: number): void {
  const state = stateOf(key);
  const current = state.entries[state.cursor];

  if (current && current.path === path) {
    // 同じファイルを開き直しただけの場合（ダイアログで同じファイルを選ぶなど）。
    // 呼び出し側がスクロール位置を先頭へ戻しているため、記録する位置も先頭にする。
    current.scrollTop = 0;
    return;
  }
  if (current) current.scrollTop = currentScrollTop;

  state.entries = state.entries.slice(0, state.cursor + 1);
  state.entries.push({ path, scrollTop: 0 });
  if (state.entries.length > LIMIT) state.entries = state.entries.slice(state.entries.length - LIMIT);
  state.cursor = state.entries.length - 1;
}

/**
 * カーソルを 1 つ動かし、行き先を返す。動かせなければ `null`。
 *
 * 移動する前に、現在のエントリへスクロール位置を書き戻す。
 * 戻った先から進み直したときに元の位置を復元できるのは、この処理による。
 */
export function stepHistory(key: number | null, delta: -1 | 1, currentScrollTop: number): HistoryEntry | null {
  if (key === null) return null;
  const state = stateOf(key);
  const next = state.cursor + delta;
  if (next < 0 || next >= state.entries.length) return null;

  const current = state.entries[state.cursor];
  if (current) current.scrollTop = currentScrollTop;

  state.cursor = next;
  return state.entries[next] ?? null;
}

/**
 * 移動したカーソルを元に戻す。移動先を開けなかったときだけ呼ぶ。
 *
 * 開けていないのにカーソルだけ移動していると、もう一度 `Alt+←` を押したときに操作回数と移動段数が一致しなくなる。
 */
export function revertHistoryStep(key: number | null, delta: -1 | 1): void {
  if (key === null) return;
  stateOf(key).cursor -= delta;
}

/** 戻れるか。メニューの表示条件にも使う。 */
export function canGoBack(key: number | null): boolean {
  if (key === null) return false;
  return stateOf(key).cursor > 0;
}

/** 進めるか。メニューの表示条件にも使う。 */
export function canGoForward(key: number | null): boolean {
  if (key === null) return false;
  const state = stateOf(key);
  return state.cursor >= 0 && state.cursor < state.entries.length - 1;
}

/** そのタブの履歴を破棄する。タブを閉じたときに呼ぶ（常駐アプリで履歴が増え続けないようにする）。 */
export function dropHistory(key: number): void {
  byTab.delete(key);
}

/**
 * 履歴に残っているパスを付け替える（ファイルツリーでのリネーム・移動 / ADR-0020）。
 *
 * `relocate` が `null` を返したエントリはそのまま残す。
 * 付け替えないと、`Alt+←` で戻った先が「開けないファイル」になる。
 */
export function relocateHistory(relocate: (path: string) => string | null): void {
  for (const state of byTab.values()) {
    for (const entry of state.entries) entry.path = relocate(entry.path) ?? entry.path;
  }
}

/** テスト用。すべてのタブの履歴を初期化する。 */
export function resetHistory(): void {
  byTab.clear();
}

/** テスト用。履歴の内容とカーソル位置を取り出す。 */
export function historySnapshot(key: number): { entries: HistoryEntry[]; cursor: number } {
  const state = stateOf(key);
  return { entries: state.entries.map((e) => ({ ...e })), cursor: state.cursor };
}
