/**
 * エンコーディングの再解釈（03.ux-spec/07-status-and-notifications.md §3「クリックでエンコーディング再解釈」）。
 *
 * # EOL の変換とは向きが逆である
 *
 * 改行コードは**書き戻すとき**に効くので、押しても読み直さない（`document/eol.ts`）。
 * エンコーディングは**読むとき**に効くので、押したら読み直すしかない。
 * 同じステータスバーの隣り合った項目だが、片方は保存の話で、もう片方は読み込みの話である。
 *
 * # 読み直しの経路は増やさない
 *
 * `reloadCurrent()` を通す。スクロール位置の保ち方・履歴に積まないこと・
 * 「最近開いたファイル」の順序を動かさないことは、`F5` や外部変更と同じでよい。
 * 違うのは **Rust 側に推定をやめさせる指定を 1 つ渡すこと**だけである。
 *
 * # 未保存の変更があるときは尋ねる
 *
 * 読み直しは本文を捨てる操作なので、`openPath` の入口にある確認
 * （`document/discard.ts`）がそのまま効く。**ここに確認を書き足さない。**
 * 入口を 1 本にしてある意味がなくなる。
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
