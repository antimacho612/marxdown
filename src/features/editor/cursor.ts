/**
 * カーソル位置をステータスバーへ届ける（03.ux-spec/07-status-and-notifications.md §3 / `editor` チャンク）。
 *
 * # なぜ 1 モジュールに分けるのか
 *
 * ここは **ADR-0005 が唯一「本文以外で」名指ししている経路**である。
 * 「UI が購読するのは `isDirty` / カーソル位置（rAF スロットル）/ アウトライン
 * （デバウンス）などの派生値だけ」の、カーソル位置がこれにあたる。
 * 間引きを `editor.ts` の生成コードに紛れさせると、**間引いていることが
 * 読めなくなる**。ここに置けば、外し忘れたときに落ちるテストも 1 か所で済む。
 *
 * # なぜ rAF なのか
 *
 * 矢印キーを押しっぱなしにすると、OS のキーリピートは 1 フレームに何度も届く。
 * `onDidChangeCursorPosition` はそのたびに飛ぶが、**画面に出るのはフレームに
 * 1 回でよい**。デバウンスにしないのは、止まってから遅れて出ると
 * 「追いついていない」ように見えるため。**最後の値を、次の描画に間に合わせる**
 * のが要る性質で、それはそのまま rAF の意味である。
 *
 * # 選択の文字数は出さない
 *
 * VS Code は `Ln 42, Col 8 (5 selected)` を出すが、03.ux-spec/07-status-and-notifications.md §3 の
 * 図は `Ln 42, Col 8` までしか要求していない。**押しても何も起きない項目を
 * 増やさない**のと同じ判断で、読まれない情報を常時 UI に足さない
 * （06.roadmap/invariants.md「新しく常時 UI に追加された要素について、存在理由を説明できる」）。
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
 * 報告を止めて、控えを捨てる。**エディタを破棄するときだけ呼ぶ**（M3 / N-PERF-06）。
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
