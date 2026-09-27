/**
 * Explorer を出してフォーカスする（`Ctrl+Shift+E`）。
 *
 * トグルにしないのは、常に同じ結果を返すためである（閉じるのはペイン側の `Ctrl+Shift+B`）。
 * `features/outline/show.ts` と対になる。
 *
 * フォーカス先の DOM 要素は `FileTree.svelte` だけが知っているため、そちらから登録してもらう。
 *
 * 遅延チャンクにあるツリーへ `main` から入る経路（パレットからの作成、外部からのドロップ / ADR-0020）も同じ形でここに置く。
 */
import { tick } from 'svelte';

import { openLeftPane } from '@/features/panes';

let focusTree: (() => void) | null = null;

/** ペインを開いた時点でツリーがまだ読み込まれていない。登録され次第フォーカスする。 */
let pending = false;

/**
 * `FileTree.svelte` が自分のフォーカス手段を登録する関数。
 * ペインを閉じる（＝コンポーネントが消える）ときに `null` を渡す。
 */
export function registerExplorerFocus(focus: (() => void) | null): void {
  focusTree = focus;
  if (focus === null || !pending) return;
  pending = false;
  focus();
}

/**
 * Explorer を表示してフォーカスする。閉じる動作は持たない。
 *
 * ファイルツリーは遅延チャンクにあるため（`Explorer.svelte`）、初回は Svelte の更新 1 回では間に合わない。
 * その場合は要求を覚えておき、読み込まれた時点でフォーカスする。
 */
export async function showExplorer(): Promise<void> {
  openLeftPane();
  await tick();
  if (focusTree === null) {
    pending = true;
    return;
  }
  focusTree();
}

/** 遅延チャンクにある作成の操作（コマンドパレットの `explorer.newFile` / `explorer.newFolder` / ADR-0020）。 */
export type ExplorerCreate = 'file' | 'folder';

let create: ((kind: ExplorerCreate) => void) | null = null;
let pendingCreate: ExplorerCreate | null = null;

/** `ExplorerBody.svelte` が作成の手段を登録する。閉じるときに `null` を渡す。 */
export function registerExplorerCreate(run: ((kind: ExplorerCreate) => void) | null): void {
  create = run;
  if (run === null || pendingCreate === null) return;
  const kind = pendingCreate;
  pendingCreate = null;
  run(kind);
}

/**
 * ペインを開いて、行内の入力欄で新しいファイルかフォルダの名前を受け取り始める。
 *
 * `showExplorer` と同じく、初回はツリーの遅延チャンクが届くのを待ってから始める。
 */
export async function createInExplorer(kind: ExplorerCreate): Promise<void> {
  openLeftPane();
  await tick();
  if (create === null) {
    pendingCreate = kind;
    return;
  }
  create(kind);
}

/**
 * 外部からのドロップをファイルツリーで受ける手段（F-NAV-13）。
 *
 * 位置はビューポート座標。`over` / `drop` はツリーの上なら `true` を返し、ドロップを引き受ける。
 * ツリーが無ければ（ペインが閉じている / サテライト）誰も引き受けず、従来どおりタブで開く。
 */
export interface TreeDropHandler {
  over: (x: number, y: number) => boolean;
  drop: (paths: string[], x: number, y: number) => boolean;
  leave: () => void;
}

let treeDrop: TreeDropHandler | null = null;

/** `ExplorerBody.svelte` が登録する。閉じるときに `null` を渡す。 */
export function registerTreeDrop(handler: TreeDropHandler | null): void {
  treeDrop?.leave();
  treeDrop = handler;
}

/** ドロップの経路（`app/bootstrap.ts`）が、ツリーに引き受けてもらえるかを尋ねる。 */
export function treeDropHandler(): TreeDropHandler | null {
  return treeDrop;
}
