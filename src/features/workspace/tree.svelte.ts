/**
 * ファイルツリーの状態（F-NAV-03）。
 *
 * 基点は `marxdown <dir>` で指定されたディレクトリか、利用者が選んだディレクトリ（「フォルダを開く」または表示中のファイルの親）である。
 * 開いたディレクトリだけを読む（遅延展開）。閉じたら中身を破棄する。
 * 常駐アプリであるため、一度開いただけのディレクトリを保持し続けない（N-PERF-06）。
 *
 * 木そのものはここに持たない。開いているディレクトリの集合と、その中身の対応表だけを持つ。
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
  /**
   * Tab の順路に置く 1 項目のパス（roving tabindex / WAI-ARIA の tree）。
   *
   * 全項目を順路に置くと、ファイルが数百ある基点でペインから抜けられなくなる（`features/outline/Outline.svelte` が見出しについて書いているのと同じ問題）。
   * `null` の間は先頭の項目を使う。
   *
   * 木が再帰コンポーネントであり、どの枝からも同じ 1 つを指す必要があるため、ここに置いてある。
   */
  focusPath = $state<string | null>(null);
}

/** ファイルツリーの状態。モジュールの singleton として共有する。 */
export const treeStore = new TreeStore();

/**
 * 基点を決める。開いているファイルのパスを渡すと、その親ディレクトリが基点になる。
 *
 * 基点が変わったときだけ読み直す。
 * 同じディレクトリの別のファイルへ移るたびに木を閉じ直すと、開いていた枝が失われる。
 */
export async function setTreeRoot(root: string | null): Promise<void> {
  if (root === treeStore.root) return;

  treeStore.root = root;
  treeStore.expanded = [];
  treeStore.entries = {};
  treeStore.focusPath = null;
  if (root !== null) await loadDir(root);
}

/**
 * いまの基点。ペインを開いていなくても決まる。
 *
 * クイックオープン（F-NAV-05）はレフトペインと同じ場所を検索する必要があるが、ペインを一度も開いていなければ `treeStore.root` はまだ `null` である。
 * 引数の `path` は表示中のファイルで、`null` なら基点は決まらない。
 *
 * 副作用を持たない。ここで `setTreeRoot` を呼ぶと、パレットを開いただけで木の読み込みが始まる。
 */
export function workspaceRoot(path: string | null): string | null {
  if (treeStore.root !== null) return treeStore.root;
  return path === null ? null : dirOf(path);
}

/** 開いているファイルから基点を決める。パスを持たない文書（`Ctrl+N`）では何もしない。 */
export async function setTreeRootFromFile(path: string | null): Promise<void> {
  if (path === null) return;
  await setTreeRoot(dirOf(path));
}

/**
 * 木を読み直す（`explorer.exclude` の変更）。
 *
 * 開いている枝は開いたまま保つ。
 * 基点から読み直すだけにすると、除外を 1 つ追加したときに開いていた枝がすべて閉じる。
 *
 * 除外されて親の一覧から消えた枝は、開いた状態ごと破棄する。
 * 残しても描画されず、次に同じ名前のディレクトリが現れたときに開いた状態で出てくる。
 */
export async function reloadTree(): Promise<void> {
  const root = treeStore.root;
  if (root === null) return;
  await reloadDirs([root, ...treeStore.expanded]);
}

/**
 * 指定したディレクトリだけを読み直す（開いている枝の監視 / ファイル操作の後 / ADR-0021）。
 *
 * 読んでいないディレクトリ（閉じた枝）は対象にしない。開けば読み直される。
 * 消えた枝の後始末は `reloadTree` と同じである。
 */
export async function refreshDirs(dirs: readonly string[]): Promise<void> {
  const root = treeStore.root;
  if (root === null) return;
  const loaded = dirs.filter((dir) => dir === root || treeStore.expanded.includes(dir));
  if (loaded.length > 0) await reloadDirs(loaded);
}

/** 開いている枝をすべて閉じる（ツールバーの「すべて折りたたむ」）。基点の中身は残す。 */
export function collapseAll(): void {
  const root = treeStore.root;
  treeStore.expanded = [];
  treeStore.entries = root === null ? {} : { [root]: treeStore.entries[root] ?? [] };
}

/**
 * 枝を開く。既に開いていれば何もしない。
 *
 * `toggleDir` と違って閉じる側に倒れない。
 * 閉じた枝の中へ新しいファイルを作るときや、ドラッグで枝の上に止まったときに使う。
 */
export async function expandDir(path: string): Promise<void> {
  if (treeStore.expanded.includes(path)) return;
  await toggleDir(path);
}

/**
 * リネーム・移動した枝の開閉状態とフォーカスを、新しいパスへ付け替える（ADR-0020）。
 *
 * 付け替えないと、開いていたフォルダを移しただけで移動先では閉じた状態になる。
 * 中身のパスも古くなるため、付け替えた後で読み直す。
 */
export async function relocateTree(relocate: (path: string) => string | null): Promise<void> {
  if (treeStore.root === null) return;
  treeStore.expanded = treeStore.expanded.map((path) => relocate(path) ?? path);
  const focus = treeStore.focusPath;
  if (focus !== null) treeStore.focusPath = relocate(focus) ?? focus;
  await reloadTree();
}

/** 読み直して、親の一覧から消えた枝を開いた状態ごと破棄する。 */
async function reloadDirs(dirs: readonly string[]): Promise<void> {
  const root = treeStore.root;
  if (root === null) return;

  await Promise.all(dirs.map((dir) => loadDir(dir, true)));

  // 基点から辿り直して、まだ親の一覧に残っている枝だけを残す。
  // `Set` は使わない。開いている枝はせいぜい数十で、`includes` で足りる。
  const kept = [root];
  for (let index = 0; index < kept.length; index += 1) {
    for (const entry of treeStore.entries[kept[index] ?? ''] ?? []) {
      if (!entry.dir || !treeStore.expanded.includes(entry.path)) continue;
      kept.push(entry.path);
    }
  }

  treeStore.expanded = treeStore.expanded.filter((path) => kept.includes(path));
  treeStore.entries = Object.fromEntries(Object.entries(treeStore.entries).filter(([path]) => kept.includes(path)));

  // 除外された項目を指したままにすると、Tab の順路が画面のどこにも無い場所を指す。
  const focus = treeStore.focusPath;
  if (focus !== null && Object.values(treeStore.entries).every((list) => list.every((entry) => entry.path !== focus))) {
    treeStore.focusPath = null;
  }
}

/** 開閉する。開くときに読み、閉じるときに破棄する。 */
export async function toggleDir(path: string): Promise<void> {
  if (treeStore.expanded.includes(path)) {
    treeStore.expanded = treeStore.expanded.filter((item) => item !== path);
    // 閉じた枝の中身は破棄する。開き直せば読み直せる。
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
async function loadDir(path: string, again = false): Promise<void> {
  // 読み直しは重ねてよい。監視の通知は読み込み中にも届き、その変化を落とすと一覧が古いまま残る。
  if (!again && treeStore.loading.includes(path)) return;
  treeStore.loading = [...treeStore.loading, path];

  try {
    // 基点は `explorer.exclude` の glob を解釈する起点になる（`src-tauri/src/dir.rs`）。
    const entries = await getPlatform().listDir(path, treeStore.root ?? path);
    treeStore.entries = { ...treeStore.entries, [path]: entries };
  } catch {
    treeStore.entries = { ...treeStore.entries, [path]: [] };
  } finally {
    treeStore.loading = treeStore.loading.filter((item) => item !== path);
  }
}

/** テスト用。基点も中身も破棄する。 */
export function resetTree(): void {
  treeStore.root = null;
  treeStore.expanded = [];
  treeStore.entries = {};
  treeStore.loading = [];
  treeStore.focusPath = null;
}
