/**
 * 新規ファイル（`Ctrl+N` / 03.ux-spec/04-keybindings.md §3 / 03.ux-spec/08-empty-states.md §1）。
 *
 * # 無題の文書は「パスを持たない文書」である
 *
 * 新しい状態を足したのはストアの `meta.path` が `null` を取れるようになったこと
 * だけで、それ以外は既存の文書とまったく同じ経路に載る（`store.svelte.ts` の
 * `StoredMeta`）。**開く経路も 1 本のまま**で、ここがすることは
 * 「本文が空の payload を作って `openDocument` に渡す」に尽きる。
 *
 * パスが無いことで変わるのは 4 つ。どれも `open.ts` 側で分岐している。
 *
 * ```text
 * 最近開いたファイル  積まない（開き直す先が無い）
 * 戻る / 進む        積まない（戻っても本文はどこにも無い）
 * ファイル監視        張らない（外から書き換わる実体が無い）
 * 相対パスの画像      基点が無いので解決しない
 * ```
 *
 * 保存は `Ctrl+S` が「名前を付けて保存」に化ける（`save.ts`）。
 *
 * # Edit モードで開く
 *
 * 既定の表示モードは Preview だが、**空の本文を Preview で開いても何も見えない。**
 * 「新規ファイル」を押した人の意図は読むことではないので、ここだけモードを移す。
 *
 * # 捨てる前に訊く
 *
 * 単一文書のアプリでは「新しく作る」が「いまの文書を閉じる」でもある。
 * 確認は `openPath` と同じ `confirmDiscard()` を通す（F-EDIT-03）。
 * **タブが入れば（M3）この確認は要らなくなる。** そのとき消すのはこの 3 行だけで済む。
 */
import { setMode } from '@/features/view/mode';

import { confirmDiscard } from './discard';
import { openDocument } from './open';
import type { StoredPayload } from './store.svelte';

/**
 * 無題の文書の初期値。
 *
 * **UTF-8 / LF / BOM なし。** 新しく作るものに、既存ファイルの都合を継がせない
 * （N-CMP-03 が守るのは「読んだファイルのバイト列」であって、
 * 新規作成の既定値はこちらで決めてよい）。
 *
 * `mtimeMs` は 0。保存時は `expectedMtimeMs: null`（新規作成）で書きに行くので、
 * この値が読まれることはない（`save.ts` の `saveAs`）。
 */
function untitled(): StoredPayload {
  return {
    path: null,
    content: '',
    eol: 'lf',
    bom: false,
    encoding: 'utf8',
    mtimeMs: 0,
    size: 0,
    readonly: false,
  };
}

/**
 * 空の文書を開く。**取り消されたら何もしない。**
 *
 * 返り値は「作ったか」。失敗（描画の例外）は `openDocument` が通知に出す。
 */
export async function newDocument(): Promise<boolean> {
  if (!(await confirmDiscard())) return false;

  const outcome = await openDocument(untitled(), { resetScroll: true });
  if (outcome === null) return false;

  // 空の本文を読む面に居ても仕方がない。**打てる場所へ移す。**
  await setMode('edit');
  return true;
}
