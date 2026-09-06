/**
 * 新規ファイル（`Ctrl+N` / 03.ux-spec/04-keybindings.md §3 / 03.ux-spec/08-empty-states.md §1）。
 *
 * 無題の文書は「パスを持たない文書」であり、ストアの `meta.path` が `null` を取れる以外は既存の文書と同じ開く経路に載る。
 * パス無しによる分岐（最近のファイル・履歴・監視・相対パス画像を扱わない）はすべて `open.ts` 側にある。
 * 既定は Preview だが空の本文は読めないため Edit モードで開き、確認は `openPath` と同じ `confirmDiscard()` を通す（単一文書アプリでは「新しく作る」も「いまの文書を閉じる」ことになるため / F-EDIT-03）。
 */
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
 * 作った後に移る先（`app/bootstrap.ts` が渡す）。
 *
 * モードの切り替えは `features/mode` の仕事だが、あちらは編集の実体（Monaco）を
 * 抱えており、その先が本文の読み書きでこの feature へ戻ってくる。
 * 直接呼ぶと feature 単位で循環するため注入で受け取る
 * （`configureHistory` / `installLinkHandler` と同じ形）。
 */
let toEditMode: (() => Promise<void>) | null = null;

export function configureNewDocument(next: () => Promise<void>): void {
  toEditMode = next;
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
  await toEditMode?.();
  return true;
}
