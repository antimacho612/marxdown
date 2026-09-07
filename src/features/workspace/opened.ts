/**
 * 開けた / 開けなかったことを受け取る側（`document/open.ts` の `OpenerConfig`）。
 *
 * タブと最近開いたファイルはどちらも workspace の持ち物であり、開く側から直接呼ぶと feature が循環する。
 * 組み立てはここに 1 つ置き、起動経路（`app/bootstrap.ts`）と単体テストが同じものを使う。
 */
import type { OpenerConfig } from '@/features/document';

import { forgetRecent, rememberRecent } from './recent.svelte';
import { adoptOpened } from './tabs.svelte';

/** `configureOpener` に混ぜる。`configureOpener({ parser, ...workspaceOpenerHooks() })`。 */
export function workspaceOpenerHooks(): Pick<OpenerConfig, 'onOpened' | 'onMissing'> {
  return {
    onOpened: (meta, { remember }) => {
      adoptOpened(meta);
      // 無題の文書（`Ctrl+N`）は積む対象が無い。
      if (remember && meta.path !== null) void rememberRecent(meta.path);
    },
    onMissing: (path) => void forgetRecent(path),
  };
}
