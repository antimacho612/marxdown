/**
 * 新規ファイル（`Ctrl+N` / 03.ux-spec/04-keybindings.md §3 / 03.ux-spec/08-empty-states.md §1）。
 *
 * 無題の文書は「パスを持たない文書」であり、ストアの `meta.path` が `null` を取れる以外は既存の文書と同じ開く経路を通る。
 * パス無しによる分岐（最近のファイル・履歴・監視・相対パス画像を扱わない）はすべて `open.ts` 側にある。
 *
 * 開く先は新しいタブである（`features/workspace`）。
 * いまの文書を置き換えないので、破棄の確認（`confirmDiscard`）は要らない。
 * 同じタブに重ねると、Undo で前の文書の本文が編集面へ入る経路も生まれる（`document/text.ts` の `switchTo`）。
 * 空の本文は Preview で読めないため、開いた後に編集できるモードへ移す（実行するのは `app/commands.ts`）。
 */
import type { StoredPayload } from './store.svelte';

/**
 * 無題の文書の初期値。
 *
 * UTF-8 / LF / BOM なしとする。
 * 新しく作る文書に既存ファイルの設定を引き継がせない（N-CMP-03 が対象とするのは読み込んだファイルのバイト列であり、新規作成の既定値はここで決めてよい）。
 *
 * `mtimeMs` は 0 にする。
 * 保存時は `expectedMtimeMs: null`（新規作成）で書き込むため、この値が参照されることはない（`save.ts` の `saveAs`）。
 */
export function untitledPayload(): StoredPayload {
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
