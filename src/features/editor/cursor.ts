/**
 * カーソル位置をステータスバーへ届ける（03.ux-spec/07-status-and-notifications.md §3 / `editor` チャンク）。
 *
 * ADR-0005 が「本文以外」で名指ししている派生値の 1 つである。
 * 1 モジュールに分けたのは、間引きが `editor.ts` の生成コードに紛れて読めなくなるのを避けるためである。
 * rAF で間引くのは、キーリピートで毎フレーム飛ぶ更新を最後の値だけ次の描画に反映すればよいためである（デバウンスだと止まってから遅れて出て「追いついていない」ように見える）。
 * 選択の文字数は表示しない（03.ux-spec/07-status-and-notifications.md §3 が要求していない情報を常時 UI に足さない）。
 */
import { documentStore } from '@/features/document/store.svelte';

import type { monaco } from './monaco';

/** 次の描画で出す位置。1 フレームのあいだに何度上書きされてもよい。 */
let pending: monaco.IPosition | null = null;
let frame: number | null = null;

/**
 * カーソル位置の報告を始める。`mountEditor` から 1 回だけ呼ぶ。
 *
 * 載せた時点の位置も**すぐに**入れる（間引きを通さない）。Edit へ切り替えた
 * 直後のステータスバーが 1 フレームだけ空になるのを避けるためで、
 * ここは押しっぱなしの経路ではないので間引く理由が無い。
 */
export function installCursorReport(editor: monaco.editor.IStandaloneCodeEditor): void {
  publish(editor.getPosition());

  editor.onDidChangeCursorPosition((e) => {
    schedule(e.position);
  });

  // モデルごと差し替わる（別のファイルを開く / `document/text.ts` の `replace`）と、
  // 位置は 1 行 1 桁へ戻る。**そのときは `onDidChangeCursorPosition` が飛ぶ**ので、
  // ここで別途拾う必要は無い。
}

/**
 * 報告を止めて、控えを捨てる。**エディターを破棄するときだけ呼ぶ**（M3 / N-PERF-06）。
 *
 * 予約したフレームを取り消しておかないと、破棄した後に 1 回だけ古い位置が出る。
 */
export function stopCursorReport(): void {
  if (frame !== null) cancelAnimationFrame(frame);
  frame = null;
  pending = null;
  documentStore.cursor = null;
}

function schedule(position: monaco.IPosition): void {
  pending = position;
  if (frame !== null) return;

  frame = requestAnimationFrame(() => {
    frame = null;
    publish(pending);
    pending = null;
  });
}

function publish(position: monaco.IPosition | null): void {
  if (!position) return;
  const current = documentStore.cursor;
  // 同じ位置なら代入しない。**動かない値でリアクティビティを起こさない**
  // （`setDirty` が値の変化だけを通すのと同じ）。
  if (current && current.line === position.lineNumber && current.column === position.column) return;
  documentStore.cursor = { line: position.lineNumber, column: position.column };
}
