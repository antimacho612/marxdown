/**
 * ファイルツリーからのファイル操作（F-NAV-11〜13 / ADR-0020 / 03.ux-spec/06-panes.md §1.4）。
 *
 * コンテキストメニュー・ツリー内のキー・ドラッグ＆ドロップのどれから入っても、ここの関数を通る。
 * 入口ごとに実装を持つと、同じ操作で結果の伝え方が変わる。
 *
 * 開いているタブと最近開いたファイルの付け替えはここでは行わない。
 * Rust が全ウィンドウへ流すイベントを `relocate.ts` が受けて行う（サテライトのタブも対象になるため）。
 * ここで行うのは、操作したウィンドウのツリーの読み直しと選択の移動だけである。
 */
import { describeOpenError, documentStore, notifyStatus } from '@/features/document';
import { ja } from '@/i18n/ja';
import { jaExplorer } from '@/i18n/ja-explorer';
import { dirOf, relocatePath, splitPath } from '@/lib/path';
import { getPlatform, type DirEntry } from '@/platform';

import { openPathInSatellite } from '../new-window';
import { isTabDirty, openPathInNewTab, tabMeta, tabsStore } from '../tabs.svelte';
import { expandDir, refreshDirs, treeStore } from '../tree.svelte';
import { markdownLink, relativeToRoot } from './link';
import { withDefaultExtension } from './name';
import { forgetPaths, selection, selectOnly } from './selection.svelte';

function fail(e: unknown, subject: string): void {
  documentStore.notice = { level: 'error', message: jaExplorer.operationFailed(describeOpenError(e, subject)) };
}

/** 読み込み済みの一覧から項目を探す。閉じた枝の中は探さない（見えていないものは操作の起点にならない）。 */
export function findEntry(path: string): DirEntry | null {
  for (const list of Object.values(treeStore.entries)) {
    const found = list.find((entry) => entry.path === path);
    if (found) return found;
  }
  return null;
}

/** 同じ階層にある名前。行内の入力欄が衝突を検査するために使う。 */
export function siblingNames(parent: string): string[] {
  return (treeStore.entries[parent] ?? []).map((entry) => entry.name);
}

/**
 * 操作の宛先になるフォルダ。フォルダならそれ自身、ファイルならその親、何も指していなければ基点。
 *
 * VS Code と同じく、ファイルを選んだまま「新しいファイル」を押すと隣に作られる。
 */
export function destinationOf(path: string | null): string | null {
  const root = treeStore.root;
  if (path === null || root === null || path === root) return root;
  const entry = findEntry(path);
  if (entry === null) return root;
  return entry.dir ? entry.path : dirOf(entry.path);
}

function focusLater(path: string): void {
  selectOnly(path);
  treeStore.focusPath = path;
  selection.refocus = path;
}

function parentsOf(paths: readonly string[]): string[] {
  return [...new Set(paths.map((path) => dirOf(path)))];
}

/**
 * 行内の入力欄を出して、新しいファイルかフォルダの名前を受け取り始める。
 *
 * 閉じた枝の中に作るときは、先にその枝を開く。入力欄を出す場所が見えていなければならない。
 */
export async function startCreate(dir: boolean, base: string | null = null): Promise<void> {
  const parent = destinationOf(base ?? treeStore.focusPath);
  if (parent === null) return;
  if (parent !== treeStore.root) await expandDir(parent);
  selection.editing = { kind: 'create', parent, dir };
}

/**
 * 名前を確定して作る。ファイルは作った後にタブで開く（Markdown First）。
 *
 * `.` で始まる名前は作れるが、ツリーには出ない（隠しファイルは常に除外される）。
 * 作った直後に消えたように見えないよう、その旨をステータスバーへ出す。
 */
export async function commitCreate(parent: string, dir: boolean, typed: string): Promise<void> {
  selection.editing = null;
  const name = dir ? typed : withDefaultExtension(typed);
  try {
    const created = await getPlatform().createEntry(parent, name, dir);
    await refreshDirs([parent]);
    if (name.startsWith('.')) {
      notifyStatus(jaExplorer.hiddenCreated(name));
      return;
    }
    focusLater(created);
    if (!dir) await openPathInNewTab(created);
  } catch (e) {
    fail(e, name);
  }
}

/** リネームの入力欄を出す。基点は対象にしない（`src-tauri/src/fsops.rs` も拒む）。 */
export function startRename(path: string): void {
  if (path === treeStore.root) return;
  selection.editing = { kind: 'rename', path };
}

/** 名前を確定して変える。変わっていなければ何もしない。 */
export async function commitRename(path: string, name: string): Promise<void> {
  selection.editing = null;
  if (name === splitPath(path).name) return;
  try {
    const moved = await getPlatform().renameEntry(path, name);
    await refreshDirs([dirOf(path)]);
    focusLater(moved.to);
  } catch (e) {
    fail(e, name);
  }
}

/** その項目の配下（または項目そのもの）に、未保存の変更があるタブがあるか。削除の確認文に使う。 */
function hasDirtyTab(paths: readonly string[]): boolean {
  return tabsStore.tabs.some((tab) => {
    const path = tabMeta(tab).path;
    return path !== null && isTabDirty(tab) && paths.some((target) => relocatePath(path, target, target) !== null);
  });
}

/** 画面に見えている順の項目（閉じた枝の中は含まない）。 */
export function visibleOrder(): string[] {
  return [...document.querySelectorAll<HTMLElement>('.mx-tree__item[data-mx-path]')].map(
    (item) => item.dataset['mxPath'] ?? '',
  );
}

/**
 * ゴミ箱へ移す（ADR-0020 §3.3）。必ず確認する。
 *
 * 消えた後は、消えた項目の次に見えていた項目へフォーカスを移す（VS Code と同じ）。
 * 先頭へ戻すと、続けて消していく操作のたびに探し直すことになる。
 */
export async function trashTargets(paths: readonly string[]): Promise<void> {
  const root = treeStore.root;
  const targets = paths.filter((path) => path !== root);
  if (targets.length === 0) return;

  const platform = getPlatform();
  const names = targets.map((path) => splitPath(path).name);
  if (
    !(await platform.confirmAction(jaExplorer.confirmTrash(names, hasDirtyTab(targets)), jaExplorer.confirmTrashButton))
  ) {
    return;
  }

  const order = visibleOrder();
  const last = Math.max(...targets.map((path) => order.indexOf(path)));
  const next = order
    .slice(last + 1)
    .find((path) => targets.every((target) => relocatePath(path, target, target) === null));

  try {
    const removed = await platform.trashEntries([...targets]);
    forgetPaths(removed);
    if (removed.length > 0) notifyStatus(jaExplorer.trashed(removed.length));
    if (next !== undefined) focusLater(next);
  } catch (e) {
    fail(e, names.join(', '));
  } finally {
    await refreshDirs(parentsOf(targets));
  }
}

/** アプリ内のクリップボードへ入れる（`Ctrl+C` / `Ctrl+X`）。 */
export function setClipboard(paths: readonly string[], mode: 'copy' | 'cut'): void {
  if (paths.length === 0) return;
  selection.clipboard = { paths: [...paths], mode };
}

/**
 * 貼り付ける（`Ctrl+V`）。宛先は `base` の場所（フォルダならその中、ファイルならその隣）。
 *
 * 切り取りの貼り付けは移動であり、確認しない。
 * 切り取ってから貼り付けるまでの 2 手が、既に意図の確認になっている（ドラッグの移動は 1 手で起きるため確認する）。
 */
export async function paste(base: string | null): Promise<void> {
  const clipboard = selection.clipboard;
  const dest = destinationOf(base);
  if (clipboard === null || dest === null) return;

  if (clipboard.mode === 'cut') {
    selection.clipboard = null;
    await moveTo(clipboard.paths, dest);
    return;
  }
  await copyTo(clipboard.paths, dest);
}

/** 複製する。同じ名前があれば `名前 copy` として置かれる（`src-tauri/src/fsops.rs`）。 */
export async function copyTo(paths: readonly string[], dest: string): Promise<void> {
  try {
    const created = await getPlatform().copyEntries([...paths], dest);
    await refreshDirs([dest]);
    notifyStatus(jaExplorer.copied(created.length));
    const first = created[0];
    if (first !== undefined) focusLater(first);
  } catch (e) {
    fail(e, splitPath(dest).name);
    await refreshDirs([dest]);
  }
}

/** 移す。途中で失敗しても、移った分のタブは `relocate.ts` が付け替える。 */
export async function moveTo(paths: readonly string[], dest: string): Promise<void> {
  try {
    const moved = await getPlatform().moveEntries([...paths], dest);
    if (moved.length > 0) notifyStatus(jaExplorer.moved(moved.length));
    const first = moved[0];
    if (first !== undefined) focusLater(first.to);
  } catch (e) {
    fail(e, splitPath(dest).name);
  } finally {
    await refreshDirs([dest, ...parentsOf(paths)]);
  }
}

/**
 * ドラッグで落とした（F-NAV-12）。`copy` は `Ctrl` を押していたか。
 *
 * 移動は確認してから行う（ADR-0020 §3.1）。
 * ドラッグは 1 手で起き、手が滑っただけでも成立してしまう。
 */
export async function dropEntries(paths: readonly string[], dest: string, copy: boolean): Promise<void> {
  if (copy) {
    await copyTo(paths, dest);
    return;
  }
  const names = paths.map((path) => splitPath(path).name);
  const destName = splitPath(dest).name || dest;
  if (!(await getPlatform().confirmAction(jaExplorer.confirmMove(names, destName), jaExplorer.confirmMoveButton)))
    return;
  await moveTo(paths, dest);
}

/** 外部からツリーへ落とされた項目を複製する（F-NAV-13）。確認しない（元は残る）。 */
export async function importDropped(paths: readonly string[], dest: string): Promise<void> {
  try {
    const created = await getPlatform().importDropped([...paths], dest);
    if (dest !== treeStore.root) await expandDir(dest);
    await refreshDirs([dest]);
    notifyStatus(jaExplorer.copied(created.length));
    const first = created[0];
    if (first !== undefined) focusLater(first);
  } catch (e) {
    fail(e, splitPath(dest).name);
  }
}

async function writeClipboard(text: string, done: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    notifyStatus(done);
  } catch {
    // 権限が無い場合やセキュアコンテキストでない場合に失敗する（`app/StatusBar.svelte` と同じ）。
    notifyStatus(ja.status.pathCopyFailed);
  }
}

/** パスをコピーする。複数あれば改行で区切る（VS Code と同じ）。 */
export async function copyPaths(paths: readonly string[], relative: boolean): Promise<void> {
  const root = treeStore.root;
  const lines = paths.map((path) => (relative && root !== null ? relativeToRoot(path, root) : path));
  await writeClipboard(lines.join('\n'), ja.status.pathCopied);
}

/**
 * 表示中の文書から見た Markdown のリンクをコピーする。
 *
 * 文書が無い（無題 / 何も開いていない）ときは基点から見たリンクにする。
 */
export async function copyMarkdownLink(path: string): Promise<void> {
  const current = documentStore.meta?.path ?? null;
  const from = current === null ? treeStore.root : dirOf(current);
  if (from === null) return;
  await writeClipboard(markdownLink(path, from), jaExplorer.linkCopied);
}

/** OS のファイルマネージャで、その項目を選んだ状態で開く。 */
export async function revealEntry(path: string): Promise<void> {
  try {
    await getPlatform().revealInFileManager(path);
  } catch (e) {
    fail(e, path);
  }
}

/** 開く。サテライトで開くのはファイルだけである（`FileTree.svelte` の `open` と同じ）。 */
export function openEntry(path: string, satellite = false): void {
  void (satellite ? openPathInSatellite(path) : openPathInNewTab(path));
}
