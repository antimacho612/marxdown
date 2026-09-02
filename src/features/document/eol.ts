/**
 * 改行コードの変換（F-EDIT-14 / 03.ux-spec/07-status-and-notifications.md §3「クリックで EOL 変換」）。
 *
 * # 変換しても、押した時点ではディスクは変わらない
 *
 * ここが決めるのは**次の保存で書き戻す改行コード**だけである（`document/save.ts`）。
 * メモリ上の本文は常に LF で、CRLF への復元は Rust 側の境界が行う
 * （N-CMP-03 / 02.architecture/04-rust-responsibilities.md §2）。
 * だから「変換」は本文を 1 バイトも触らずに済み、
 * 押した結果は**未保存の変更が 1 つ増えること**として現れる。
 *
 * VS Code の「行末シーケンスの選択」と同じ挙動である（Familiar）。
 * 押した瞬間に保存する案は採らなかった。ダーティな本文を巻き込んで
 * ディスクへ書くことになり、**改行コードを直しただけのつもりが
 * 「保存」になる**。押す前に結果が読めない操作は作らない（Principle 3）。
 *
 * # N-CMP-03 の例外であることを明示しておく
 *
 * 「編集・保存で、触っていない箇所のバイト列を変えない」に対して、
 * これは**全行の行末を変える**操作である。要件が禁じているのは
 * 気づかないうちに変わることであり、明示的に押した結果として変わるのは別である。
 * ステータスバーのラベルに変換先を出しているのは、そのための担保でもある。
 */
import type { Eol } from '@/platform';

import { refreshDirty } from './dirty';
import { documentStore } from './store.svelte';

/**
 * いま保存に使う改行コード。**ステータスバーが出しているのもこれ。**
 * 何も開いていなければ `null`。
 */
export function effectiveEol(): Eol | null {
  return documentStore.eolOverride ?? documentStore.meta?.eol ?? null;
}

/** ディスクと違う改行コードを選んでいるか。＝未保存の変更の 1 種。 */
export function isEolChanged(): boolean {
  return documentStore.eolOverride !== null;
}

/** 押したときの行き先。**2 値しかないのでメニューを出さない。** */
export function nextEol(): Eol | null {
  const current = effectiveEol();
  if (current === null) return null;
  return current === 'lf' ? 'crlf' : 'lf';
}

/**
 * LF ⇄ CRLF を切り替える。
 *
 * ディスクと同じ値に戻したときは希望そのものを消す。
 * **「変えて、戻した」が「変えていない」に戻る**のは、
 * 未保存の印が残り続けないために要る（`store.svelte.ts` の `eolOverride`）。
 */
export function toggleEol(): void {
  const meta = documentStore.meta;
  const next = nextEol();
  if (meta === null || next === null) return;

  documentStore.eolOverride = next === meta.eol ? null : next;
  refreshDirty();
}
