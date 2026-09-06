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

let entries: HistoryEntry[] = [];
/** いま見ているエントリの添字。何も開いていなければ `-1`。 */
let cursor = -1;

/**
 * 開いたドキュメントを積む。離れる直前のスクロール位置も併せて受け取る。
 *
 * 現在位置より先（`Alt+←` で戻った後の「進む」側）は破棄する。
 * ブラウザと同じく、戻ってから別の場所へ移動すれば分岐は失われる。
 */
export function pushHistory(path: string, currentScrollTop: number): void {
  const current = entries[cursor];

  if (current && current.path === path) {
    // 同じファイルを開き直しただけの場合（ダイアログで同じファイルを選ぶなど）。
    // 呼び出し側がスクロール位置を先頭へ戻しているため、記録する位置も先頭にする。
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
 * 移動する前に、現在のエントリへスクロール位置を書き戻す。
 * 戻った先から進み直したときに元の位置を復元できるのは、この処理による。
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
 * 移動したカーソルを元に戻す。移動先を開けなかったときだけ呼ぶ。
 *
 * 開けていないのにカーソルだけ移動していると、もう一度 `Alt+←` を押したときに操作回数と移動段数が一致しなくなる。
 */
export function revertHistoryStep(delta: -1 | 1): void {
  cursor -= delta;
}

/** 戻れるか。メニューの表示条件にも使う。 */
export function canGoBack(): boolean {
  return cursor > 0;
}

/** 進めるか。メニューの表示条件にも使う。 */
export function canGoForward(): boolean {
  return cursor >= 0 && cursor < entries.length - 1;
}

/** テスト用。履歴とカーソルを初期化する。 */
export function resetHistory(): void {
  entries = [];
  cursor = -1;
}

/** テスト用。履歴の内容とカーソル位置を取り出す。 */
export function historySnapshot(): { entries: HistoryEntry[]; cursor: number } {
  return { entries: entries.map((e) => ({ ...e })), cursor };
}
