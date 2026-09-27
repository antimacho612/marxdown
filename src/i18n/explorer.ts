/**
 * ファイルツリーのファイル操作だけが使う文言（ADR-0020）。
 *
 * 使う側はすべて遅延チャンク（`features/workspace/lazy/`）にあるため、`t` とは分けて、ツリーかタブのメニューを開くまで読み込まない。
 * 入口のコンポーネント（`ExplorerBody` / `TabMenu`）が `ready` を export し、`main` 側はそれを待ってから描く。
 */
import { lazyMessages } from './index';
import type { ExplorerMessages } from './types';

const explorer = lazyMessages<ExplorerMessages>({
  ja: async () => {
    const { jaExplorer } = await import('./ja/explorer');
    return jaExplorer;
  },
});

/** 表示言語のファイル操作の文言。`loadExplorerMessages()` が完了するまで空である。 */
export const tExplorer = explorer.messages;

/** `tExplorer` を読み込む。 */
export const loadExplorerMessages = explorer.load;
