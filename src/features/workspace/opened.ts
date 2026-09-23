/**
 * 開けた / 開けなかったことを受け取る側（`document/open.ts` の `OpenerConfig`）。
 *
 * タブと最近開いたファイルはどちらも workspace の持ち物であり、開く側から直接呼ぶと feature が循環する。
 * 組み立てはここに 1 つ置き、起動経路（`app/bootstrap.ts`）と単体テストが同じものを使う。
 */
import type { OpenerConfig } from '@/features/document';

import { forgetRecent, rememberRecent } from './recent.svelte';
import { adoptOpened, targetTabKey } from './tabs.svelte';

/** `configureOpener` に混ぜる。`configureOpener({ parser, ...workspaceOpenerHooks() })`。 */
export function workspaceOpenerHooks(): Pick<OpenerConfig, 'onOpened' | 'onMissing' | 'targetKey'> {
  return {
    onOpened: (meta, { remember }) => {
      adoptOpened(meta);
      // 無題の文書（`Ctrl+N`）には記録するパスが無い。
      if (remember && meta.path !== null) void rememberRecent(meta.path);
    },
    onMissing: (path) => void forgetRecent(path),
    // 開く先のタブ。エディターはこれをキーにモデルを分け、履歴もこれで分かれる。
    // 開く前にアクティブを移してあるので、この時点の値が行き先である（`tabs.svelte.ts`）。
    targetKey: targetTabKey,
  };
}
