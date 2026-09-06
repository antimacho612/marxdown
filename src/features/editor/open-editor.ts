/**
 * エディターを載せる入口（`main` チャンク）。
 * 動的 import の一行だけを持つモジュールとして切り出してある（`open-search.ts` 等と同じ形）。
 * ここに置いても `editor` チャンクは遅延のままである。
 * 既定の表示モードが Preview なのは、この分割境界を成立させるためでもある（02.architecture/05-startup-sequence.md §1 の要点 3）。
 */
const EDITOR_SELECTOR = '#mx-editor';

/** 既に載っていれば `mountEditor` 側が何もしない。呼ぶ側は冪等性を気にしなくてよい。 */
export async function mountEditorLazily(): Promise<void> {
  const host = document.querySelector<HTMLElement>(EDITOR_SELECTOR);
  if (!host) return;
  const { mountEditor, focusEditor } = await import('./lazy/editor');
  mountEditor(host);
  focusEditor();
}

/**
 * 面を出したあとに器を測り直させる（`features/mode/mode.ts` が呼ぶ）。
 *
 * **`display: none` のあいだ Monaco は寸法を失う**
 * （[ADR-0009](../../../docs/adr/0009-editor-engine-monaco.md) の受け入れコスト 3）。
 * 呼ぶのはエディターが見えるモードに入ったときだけなので、ここで `editor` チャンクが
 * 新たに落ちてくることはない（既に `mountEditorLazily` を通っている）。
 */
export async function relayoutEditorLazily(): Promise<void> {
  const { relayoutEditor } = await import('./lazy/editor');
  relayoutEditor();
}

/**
 * チャンクだけ先に取っておく（`editor` の idle プリロード）。
 *
 * **載せはしない。** 取得と評価だけを済ませておくと、初めて `Ctrl+Shift+V` を
 * 押したときの待ちが消える。`ready()` の後のアイドルで呼ぶこと
 * （02.architecture/05-startup-sequence.md §1: IPC を伴わず、遅れても最悪は
 * 「初回の切り替えが少し遅い」だけ）。
 *
 * **Monaco になってからは任意ではなく必須である**（ADR-0009 の根拠 2）。
 * raw 3.0MB の評価を切り替えの瞬間に払うと、モード切り替えの許容上限 400ms
 * （05.performance-budget/04-targets.md §3）に収まらない。
 */
export async function preloadEditor(): Promise<void> {
  await import('./lazy/editor');
}

/**
 * 検索・置換パネルを開く（F-EDIT-05）。
 *
 * **エディターが載っていなければ何も起きない。** ここでわざわざ載せないのは、
 * Preview を見ているときの `Ctrl+F` は本文検索へ行くからで、
 * この関数まで来た時点で Edit に居ることが決まっている
 * （振り分けは `features/mode/find.ts`）。
 */
export async function openEditorSearchLazily(replace: boolean): Promise<void> {
  const { openEditorSearch } = await import('./lazy/editor');
  openEditorSearch(replace);
}

/**
 * 検索・置換パネルを閉じる（Split でプレビュー側の検索へ移るとき）。
 *
 * **一度も開いていなければ呼ばないこと。** ここを無条件に通すと、
 * Preview だけで読んでいる起動でも初めての `Ctrl+F` で `editor` チャンクが落ちてくる。
 * 閉じる相手が居るのは開いたことがある場合だけで、その判定は `features/mode/find.ts` が持つ
 * （プレビュー側の `closePreviewFind` と同じ形）。
 */
export async function closeEditorSearchLazily(): Promise<void> {
  const { closeEditorSearch } = await import('./lazy/editor');
  closeEditorSearch();
}

/**
 * Split のスクロール同期を始める / やめる（F-MODE-05 / `features/mode/mode.ts` が呼ぶ）。
 *
 * **やめる側もこの入口を通す。** `mode.ts` から `./editor` を import すると、
 * Preview だけで読んでいる起動でも `editor` チャンクが落ちてくる。
 */
export async function setSplitSyncLazily(on: boolean): Promise<void> {
  const { setSplitSync } = await import('./lazy/editor');
  setSplitSync(on);
}
