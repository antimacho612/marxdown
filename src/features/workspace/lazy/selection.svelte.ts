/**
 * ファイルツリーの選択・クリップボード・行内入力の状態（03.ux-spec/06-panes.md §1.4）。
 *
 * フォーカス（キーで動かす 1 点 / `treeStore.focusPath`）と選択（操作の対象）を分けて持つ。VS Code と同じ形である。
 * 遅延チャンクに置く。ペインを開くまで誰も参照しない。
 *
 * 表示中の文書は選択に含めない（`aria-current` で別に表す）。
 * 兼ねると、ファイルを開いただけで「選択」が移り、複数選択の途中で別のタブへ切り替えたときに選択が崩れる。
 */

/** 行内の入力欄で何をしているか。 */
export type Editing =
  | { kind: 'rename'; path: string }
  /** `parent` の中に作る。入力欄はその枝の先頭に出る。 */
  | { kind: 'create'; parent: string; dir: boolean };

class SelectionStore {
  /** 選択している項目のパス。 */
  selected = $state<string[]>([]);
  /** `Shift` での範囲選択の起点。最後に単独で選んだ項目。 */
  anchor = $state<string | null>(null);
  /**
   * アプリ内のクリップボード。OS のクリップボードとは連携しない（ADR-0020 §3.1）。
   *
   * `cut` の間は、対象を淡く表示する。
   */
  clipboard = $state<{ paths: string[]; mode: 'copy' | 'cut' } | null>(null);
  /** 行内の入力欄。同時に 1 つだけ。 */
  editing = $state<Editing | null>(null);
  /**
   * ドラッグ中に落とす先のフォルダ（F-NAV-12 / F-NAV-13）。
   *
   * 基点を指すときは、ツリーの余白全体を強調する。
   */
  dropTarget = $state<string | null>(null);
  /**
   * 次の描画の後にフォーカスを移す項目。
   *
   * 作成・リネームの直後は、新しい項目の要素がまだ無い。
   * 読み直しを待ってから移すため、要素を知っている `FileTree.svelte` に処理させる。
   */
  refocus = $state<string | null>(null);
  /**
   * 開いているコンテキストメニュー。`path` が `null` なら余白（基点）に対するメニューである。
   *
   * 位置はビューポート座標。キーボードから開いたときは項目の左下に出す。
   */
  menu = $state<{ path: string | null; x: number; y: number } | null>(null);
}

/** ファイルツリーの選択。モジュールの singleton として共有する。 */
export const selection = new SelectionStore();

/** その項目だけを選ぶ（クリック / キーでの移動）。 */
export function selectOnly(path: string): void {
  selection.selected = [path];
  selection.anchor = path;
}

/** 選択に加える / 外す（`Ctrl+Click`）。 */
export function toggleSelected(path: string): void {
  selection.selected = selection.selected.includes(path)
    ? selection.selected.filter((item) => item !== path)
    : [...selection.selected, path];
  selection.anchor = path;
}

/**
 * 起点から `path` までを選ぶ（`Shift+Click` / `Shift+↑↓`）。
 *
 * `order` は画面に見えている順の項目である。閉じた枝の中身は範囲に入らない。
 * 起点が見えていなければ（消えた / 畳まれた）、`path` だけを選ぶ。
 */
export function selectRange(path: string, order: readonly string[]): void {
  const from = selection.anchor === null ? -1 : order.indexOf(selection.anchor);
  const to = order.indexOf(path);
  if (from < 0 || to < 0) {
    selectOnly(path);
    return;
  }
  const [start, end] = from < to ? [from, to] : [to, from];
  selection.selected = order.slice(start, end + 1);
}

/**
 * 操作の対象を決める（03.ux-spec/06-panes.md §1.4「選択とフォーカス」）。
 *
 * 押した項目が選択に含まれていれば選択全体、含まれていなければその 1 件である。
 * 含まれていない項目を右クリックしたときは、選択もその 1 件へ移す（VS Code と同じ）。
 */
export function targetsFor(path: string): string[] {
  if (selection.selected.includes(path)) return [...selection.selected];
  selectOnly(path);
  return [path];
}

/** 切り取り中で、淡く表示する項目か。 */
export function isCut(path: string): boolean {
  return selection.clipboard?.mode === 'cut' && selection.clipboard.paths.includes(path);
}

/** 消えた項目を選択とクリップボードから外す。 */
export function forgetPaths(removed: readonly string[]): void {
  const gone = (path: string): boolean => removed.includes(path);
  selection.selected = selection.selected.filter((path) => !gone(path));
  if (selection.anchor !== null && gone(selection.anchor)) selection.anchor = null;
  const clipboard = selection.clipboard;
  if (clipboard === null) return;
  const paths = clipboard.paths.filter((path) => !gone(path));
  selection.clipboard = paths.length === 0 ? null : { ...clipboard, paths };
}

/** テスト用。 */
export function resetSelection(): void {
  selection.selected = [];
  selection.anchor = null;
  selection.clipboard = null;
  selection.editing = null;
  selection.dropTarget = null;
  selection.refocus = null;
  selection.menu = null;
}
