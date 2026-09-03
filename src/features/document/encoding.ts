/**
 * エンコーディングの再解釈（03.ux-spec/07-status-and-notifications.md §3「クリックでエンコーディング再解釈」）。
 *
 * EOL の変換（`document/eol.ts`）は書き戻すときに効くので押しても読み直さないが、エンコーディングは読むときに効くので読み直すしかない。
 * 読み直しは `reloadCurrent()` を通し、`F5` と同じ経路にエンコーディング指定だけを 1 つ渡す。
 * 未保存の確認は `openPath` の入口（`document/discard.ts`）がそのまま効くのでここには足さない。
 */
import { ja } from '@/i18n/ja';
import type { Encoding } from '@/platform';

import { reloadCurrent } from './open';
import { documentStore } from './store.svelte';

/**
 * 表示と選択に出す順序（`src-tauri/src/document/encoding.rs` の `Encoding` と同じ 5 つ）。
 *
 * UTF-8 を先頭に置いているのは、中心ユースケース（LLM が生成したファイル）が
 * ほぼ常に UTF-8 であり、**間違えて選んだときに戻る先**でもあるため。
 */
export const ENCODINGS: readonly Encoding[] = ['utf8', 'utf16-le', 'utf16-be', 'shift-jis', 'euc-jp'];

/**
 * 指定したエンコーディングで読み直す。
 *
 * いまと同じものを選んだときは何もしない。**読み直しはスクロールも通知も伴う**ので、
 * 「選んだが変わらなかった」ときに画面が動くのは正しくない。
 */
export async function reinterpret(encoding: Encoding): Promise<void> {
  const meta = documentStore.meta;
  if (meta === null || meta.encoding === encoding) return;

  await reloadCurrent({ encoding, notice: ja.status.reinterpreted(ja.status.encoding[encoding]) });
}
