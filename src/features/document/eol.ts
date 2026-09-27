/**
 * 改行コードの変換（F-EDIT-14）。
 *
 * 押した時点ではディスクは変わらない。
 * 次の保存で書き戻す改行コードを決めるだけであり（`document/save.ts`）、メモリ上の本文は常に LF のため本文を 1 バイトも触らずに済み、結果は未保存の変更が 1 つ増えることとして現れる（VS Code の「行末シーケンスの選択」と同じ挙動）。
 * N-CMP-03（触っていない箇所を変えない）の例外だが、明示的に押した結果として全行の行末が変わるのは意図した動作であり、要件が禁じる「気づかない変化」ではない。
 */
import type { Eol } from '@/platform';

import { refreshDirty } from './dirty';
import { documentStore } from './store.svelte';

/**
 * 保存時に使う改行コード。ステータスバーが表示しているのもこの値である。
 * 何も開いていなければ `null` を返す。
 */
export function effectiveEol(): Eol | null {
  return documentStore.eolOverride ?? documentStore.meta?.eol ?? null;
}

/** ディスクと違う改行コードを選んでいるか。未保存の変更の 1 種として扱う。 */
export function isEolChanged(): boolean {
  return documentStore.eolOverride !== null;
}

/** 押したときの切り替え先。2 値しかないためメニューは表示しない。 */
export function nextEol(): Eol | null {
  const current = effectiveEol();
  if (current === null) return null;
  return current === 'lf' ? 'crlf' : 'lf';
}

/**
 * LF ⇄ CRLF を切り替える。
 *
 * ディスクと同じ値に戻したときは変換の指定自体を破棄する。
 * 変更して元に戻した結果を未変更として扱うのは、未保存の印が残り続けないようにするためである（`store.svelte.ts` の `eolOverride`）。
 */
export function toggleEol(): void {
  const meta = documentStore.meta;
  const next = nextEol();
  if (meta === null || next === null) return;

  documentStore.eolOverride = next === meta.eol ? null : next;
  refreshDirty();
}
