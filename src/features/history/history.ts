/**
 * リンク遷移の履歴（F-NAV-07 / 03.ux-spec/04-keybindings.md §3「移動」）。
 * 相対リンクでアプリ内を辿るだけでは戻れないため、ブラウザと同じ形（カーソル + 分岐で切り捨て）で `open.ts` を通ったドキュメントの切り替えだけを積む。
 *
 * 再読み込み（同じ場所に留まる操作）は積むと `Alt+←` が段階的に効かなくなるため積まない。
 * ページ内アンカーも積まない。
 * アウトラインは読みながら何度も押す道具でブラウザのアンカーリンクより押される回数が桁違いに多く、離れる直前のスクロール位置は各エントリが持つため積まなくても復元は成立する。
 *
 * 実際に開き直すのは `navigate.ts`。
 * このモジュールは配列とカーソルだけを扱い、`open.ts` との循環参照を避ける。
 */

export interface HistoryEntry {
  /** 正規化済み絶対パス（Rust から返ってきた形）。 */
  path: string;
  /** そこを離れる直前のスクロール位置。戻ってきたときに復元する。 */
  scrollTop: number;
}

/**
 * 保持する件数。
 *
 * 常駐アプリ（ADR-0007）なので、上限が無いと「1 週間開きっぱなし」で
 * 際限なく伸びる。パスと数値だけなので 50 件でも数 KB。
 */
const LIMIT = 50;

let entries: HistoryEntry[] = [];
/** いま見ているエントリの添字。何も開いていなければ `-1`。 */
let cursor = -1;

/**
 * 開いたドキュメントを積む。**離れる直前のスクロール位置を一緒に受け取る。**
 *
 * 現在位置より先（＝`Alt+←` で戻った後の「進む」側）は捨てる。
 * ブラウザと同じで、戻ってから別の場所へ行けば分岐は消える。
 */
export function pushHistory(path: string, currentScrollTop: number): void {
  const current = entries[cursor];

  if (current && current.path === path) {
    // 同じファイルを開き直しただけ（ダイアログで同じものを選ぶなど）。
    // 呼び出し側は先頭へ戻しているので、控える位置も先頭にする。
    current.scrollTop = 0;
    return;
  }
  if (current) current.scrollTop = currentScrollTop;

  entries = entries.slice(0, cursor + 1);
  entries.push({ path, scrollTop: 0 });
  if (entries.length > LIMIT) entries = entries.slice(entries.length - LIMIT);
  cursor = entries.length - 1;
}

/**
 * カーソルを 1 つ動かし、行き先を返す。動かせなければ `null`。
 *
 * 動かす前に、いまのエントリへスクロール位置を書き戻す。
 * **戻った先から進み直したときに、読んでいた場所へ帰れるのはこれのおかげ。**
 */
export function stepHistory(delta: -1 | 1, currentScrollTop: number): HistoryEntry | null {
  const next = cursor + delta;
  if (next < 0 || next >= entries.length) return null;

  const current = entries[cursor];
  if (current) current.scrollTop = currentScrollTop;

  cursor = next;
  return entries[next] ?? null;
}

/**
 * 動かしたカーソルを戻す。**行き先が開けなかったときだけ**呼ぶ。
 *
 * 開けなかったのに位置だけ進んでいると、もう一度 `Alt+←` を押したときに
 * 「押した回数」と「戻った段数」が合わなくなる。
 */
export function revertHistoryStep(delta: -1 | 1): void {
  cursor -= delta;
}

export function canGoBack(): boolean {
  return cursor > 0;
}

export function canGoForward(): boolean {
  return cursor >= 0 && cursor < entries.length - 1;
}

/** テスト用。 */
export function resetHistory(): void {
  entries = [];
  cursor = -1;
}

/** テスト用。中身を覗く。 */
export function historySnapshot(): { entries: HistoryEntry[]; cursor: number } {
  return { entries: entries.map((e) => ({ ...e })), cursor };
}
