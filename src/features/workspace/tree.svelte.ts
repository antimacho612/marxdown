/**
 * ファイルツリーの状態（F-NAV-03 / 03.ux-spec/06-panes.md §1）。
 *
 * 基点は「開いているファイルの親ディレクトリ」または `marxdown <dir>` で指定されたディレクトリ。
 * 開いたディレクトリだけを読む（遅延展開）。閉じたら中身を捨てる。
 * 常駐アプリなので、一度開いただけのディレクトリを抱え続けない（N-PERF-06）。
 *
 * 木そのものはここに持たない。**開いているディレクトリの集合と、その中身の対応表**だけを持つ。
 * 入れ子の配列にすると、1 か所を開くたびに親から作り直すことになる。
 */
import { dirOf } from '@/lib/path';
import { getPlatform, type DirEntry } from '@/platform';

class TreeStore {
  /** 木の基点。何も開いていなければ `null`。 */
  root = $state<string | null>(null);
  /** 開いているディレクトリのパス。 */
  expanded = $state<string[]>([]);
  /** ディレクトリごとの中身。開いたものだけが入る。 */
  entries = $state<Record<string, DirEntry[]>>({});
  /** 読み込み中のディレクトリ。件数の多い場所で「押しても何も起きない」ように見せない。 */
  loading = $state<string[]>([]);
}

/** ファイルツリーの状態。モジュールの singleton として共有する。 */
export const treeStore = new TreeStore();

/**
 * 基点を決める。開いているファイルのパスを渡すと、その親ディレクトリが基点になる。
 *
 * 基点が変わったときだけ読み直す。
 * 同じディレクトリの別のファイルへ移るたびに木を畳み直すと、開いていた枝が失われる。
 */
export async function setTreeRoot(root: string | null): Promise<void> {
  if (root === treeStore.root) return;

  treeStore.root = root;
  treeStore.expanded = [];
  treeStore.entries = {};
  if (root !== null) await loadDir(root);
}

/** 開いているファイルから基点を決める。パスを持たない文書（`Ctrl+N`）では何もしない。 */
export async function setTreeRootFromFile(path: string | null): Promise<void> {
  if (path === null) return;
  await setTreeRoot(dirOf(path));
}

/** 開閉する。開くときに読み、閉じるときに捨てる。 */
export async function toggleDir(path: string): Promise<void> {
  if (treeStore.expanded.includes(path)) {
    treeStore.expanded = treeStore.expanded.filter((item) => item !== path);
    // 閉じた枝の中身は捨てる。開き直せば読み直せる。
    const rest = { ...treeStore.entries };
    delete rest[path];
    treeStore.entries = rest;
    return;
  }

  treeStore.expanded = [...treeStore.expanded, path];
  await loadDir(path);
}

/**
 * 1 階層ぶん読む。失敗しても木は壊さない。
 *
 * 読めないディレクトリ（権限が無い / 消えた）は空として扱う。
 * 通知は出さない。一覧を眺めているだけの操作で通知バーが出続けることになる。
 */
async function loadDir(path: string): Promise<void> {
  if (treeStore.loading.includes(path)) return;
  treeStore.loading = [...treeStore.loading, path];

  try {
    const entries = await getPlatform().listDir(path);
    treeStore.entries = { ...treeStore.entries, [path]: entries };
  } catch {
    treeStore.entries = { ...treeStore.entries, [path]: [] };
  } finally {
    treeStore.loading = treeStore.loading.filter((item) => item !== path);
  }
}

/** テスト用。基点も中身も捨てる。 */
export function resetTree(): void {
  treeStore.root = null;
  treeStore.expanded = [];
  treeStore.entries = {};
  treeStore.loading = [];
}
