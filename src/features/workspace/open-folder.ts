/**
 * フォルダを開いてファイルツリーの基点にする（F-NAV-03 / 03.ux-spec/04-keybindings.md §3 の `Ctrl+Alt+O`）。
 *
 * 基点が決まるのは、`marxdown <dir>` で起動したときか、ここを通ったときだけである。
 * 開いているファイルの親ディレクトリを自動で基点にはしない（#103）。
 * ファイルを 1 枚見るだけの起動で、その隣にあるものまで読みに行く理由が無い。
 *
 * ダイアログは基点を許可するところまでを Rust 側が担当する（`pick_folder`）。
 * 辿れる範囲と読める範囲が一致していないと、開いた直後のツリーがスコープ外で空になる（N-SEC-05）。
 */
import { openLeftPane } from '@/features/panes';
import { getPlatform } from '@/platform';

import { setTreeRoot } from './tree.svelte';

/**
 * ダイアログでフォルダを選び、ファイルツリーの基点にする。
 *
 * 取り消されたら何もしない。ペインも開かない。
 * ダイアログ自体の失敗は投げる。通知に出すかどうかは呼び出し側が決める（`document.open` と同じ形）。
 */
export async function openFolderViaDialog(): Promise<string | null> {
  const picked = await getPlatform().pickFolder();
  if (picked === null) return null;

  await setTreeRoot(picked);
  openLeftPane();
  return picked;
}
