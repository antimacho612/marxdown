/**
 * カーソル位置をステータスバーへ届ける（`editor` チャンク）。
 *
 * ADR-0005 が「本文以外」で名指ししている派生値の 1 つである。
 * 1 モジュールに分けたのは、間引きが `editor.ts` の生成コードに紛れて読めなくなるのを避けるためである。
 * rAF で間引くのは、キーリピートで毎フレーム発火する更新を最後の値だけ次の描画に反映すればよいためである（デバウンスでは入力が止まってから遅れて表示され、追従していないように見える）。
 * 選択の文字数は表示しない（UX 仕様が要求していない情報を常時 UI に追加しない）。
 */
import { documentStore } from '@/features/document';

import type { monaco } from './monaco';

/** 次の描画で反映する位置。1 フレームの間に何度上書きされてもよい。 */
let pending: monaco.IPosition | null = null;
let frame: number | null = null;

/**
 * カーソル位置の報告を始める。`mountEditor` から 1 回だけ呼ぶ。
 *
 * マウントした時点の位置は間引かずに即座に反映する。
 * Edit へ切り替えた直後のステータスバーが 1 フレームだけ空になるのを避けるためであり、この経路はキーリピートで繰り返し呼ばれるものではない。
 */
export function installCursorReport(editor: monaco.editor.IStandaloneCodeEditor): void {
  publish(editor.getPosition());

  editor.onDidChangeCursorPosition((e) => {
    schedule(e.position);
  });

  // モデルごと差し替わる（別のファイルを開く / `document/text.ts` の `replace`）と、位置は 1 行 1 桁へ戻る。
  // そのときは `onDidChangeCursorPosition` が発火するため、ここで個別に処理する必要はない。
}

/**
 * 報告を停止し、保持している位置を破棄する。
 *
 * 予約したフレームを取り消しておかないと、停止した後に 1 回だけ古い位置が表示される。
 *
 * NOTE: エディター本体を破棄する経路は無いため、現状ではテストの後始末でのみ呼ばれる。
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
  // 同じ位置なら代入しない。
  // 変化していない値でリアクティビティを発生させない（`setDirty` が値の変化だけを通すのと同じ）。
  if (current && current.line === position.lineNumber && current.column === position.column) return;
  documentStore.cursor = { line: position.lineNumber, column: position.column };
}
