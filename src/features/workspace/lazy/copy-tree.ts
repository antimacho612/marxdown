/**
 * ディレクトリ構造をクリップボードへコピーする（`explorer.copyTree`）。
 *
 * 走査は Rust 側が 1 回で返し（`list_tree`）、ここは整形と通知だけを行う。
 * 入口は `../copy-tree.ts` にあり、このモジュールは押されるまで読み込まない。
 */
import { documentStore, INFO_NOTICE_MS } from '@/features/document';
import { ja } from '@/i18n/ja';
import { toMessage } from '@/lib/error';
import { getPlatform, type DirTree } from '@/platform';

import { toAsciiTree } from './ascii-tree';

/**
 * `path` の配下を罫線で描いた文字列にしてコピーする。
 *
 * 結果は通知バーに出す。コピーは画面上で何も変化しないため、伝える経路がここしかない。
 * 上限で打ち切られた場合は、貼り付けた木が一部であることを添える。
 */
export async function copyTree(path: string): Promise<void> {
  let tree: DirTree;
  try {
    tree = await getPlatform().listTree(path);
  } catch (e) {
    documentStore.notice = { level: 'error', message: toMessage(e) };
    return;
  }

  try {
    await navigator.clipboard.writeText(toAsciiTree(tree));
  } catch {
    // 権限が無い場合やセキュアコンテキストでない場合に失敗する（`features/preview/enhance.ts` と同じ）。
    documentStore.notice = { level: 'error', message: ja.tree.copyFailed };
    return;
  }

  documentStore.notice = {
    level: 'info',
    message: tree.truncated ? ja.tree.copiedPartial : ja.tree.copied,
    autoDismissMs: INFO_NOTICE_MS,
  };
}
