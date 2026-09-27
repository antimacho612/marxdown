/**
 * ファイルツリーでの操作を、開いているタブ・履歴・最近開いたファイルへ反映する（ADR-0020）。
 *
 * Rust は操作の結果を全ウィンドウへ流す（`src-tauri/src/commands.rs` の `announce_moves`）。
 * ファイルツリーを持たないサテライトにも同じファイルのタブがありうるため、ここは遅延チャンクではなく起動時に購読する。
 *
 * ゴミ箱へ移したファイルのタブは閉じない。
 * 外部で削除された場合と同じく本文は画面に残り、次にそのタブへ切り替えたときに読めなければ外れる（`tabs.svelte.ts` の `dropUnopenable`）。
 */
import { relocateHistory } from '@/features/history';
import { relocatePath } from '@/lib/path';
import { getPlatform, type Moved } from '@/platform';

import { recentStore } from './recent.svelte';
import { relocateTabs } from './tabs.svelte';
import { relocateTree } from './tree.svelte';

/** いくつかの移動のうち、最初に当てはまったものでパスを付け替える。 */
function relocateBy(moves: readonly Moved[]): (path: string) => string | null {
  return (path) => {
    for (const move of moves) {
      const next = relocatePath(path, move.from, move.to);
      if (next !== null) return next;
    }
    return null;
  };
}

/**
 * 購読を始める。起動時に 1 回だけ呼ぶ。
 *
 * IPC を伴う購読であるため、`ready()` の後に呼ぶこと（`installFileWatch` と同じ）。
 */
export function installEntryWatch(): void {
  const platform = getPlatform();

  platform.onEntriesMoved(({ moves, recent }) => {
    recentStore.entries = recent;
    const relocate = relocateBy(moves);
    relocateTabs(relocate);
    relocateHistory(relocate);
    void relocateTree(relocate);
  });

  platform.onEntriesRemoved(({ recent }) => {
    recentStore.entries = recent;
  });
}
