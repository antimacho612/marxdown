/**
 * エディタを載せる入口（`main` チャンク）。
 *
 * **動的 import の一行だけを持つモジュール**として切り出してある。
 * `open-search.ts` / `open-settings.ts` / `open-jump.ts` と同じ形で、理由も同じ。
 *
 * ここに置いても `editor` チャンク（203KB）は遅延のまま。
 * 既定の表示モードが Preview なのは、この分割境界を成立させるためでもある
 * （02.architecture/05-startup-sequence.md §1 の要点 3）。
 */
const EDITOR_SELECTOR = '#mx-editor';

/** 既に載っていれば `mountEditor` 側が何もしない。呼ぶ側は冪等性を気にしなくてよい。 */
export async function mountEditorLazily(): Promise<void> {
  const host = document.querySelector<HTMLElement>(EDITOR_SELECTOR);
  if (!host) return;
  const { mountEditor, focusEditor } = await import('./editor');
  mountEditor(host);
  focusEditor();
}

/**
 * チャンクだけ先に取っておく（`editor` の idle プリロード）。
 *
 * **載せはしない。** 取得と評価だけを済ませておくと、初めて `Ctrl+Shift+V` を
 * 押したときの待ちが消える。`ready()` の後のアイドルで呼ぶこと
 * （02.architecture/05-startup-sequence.md §1: IPC を伴わず、遅れても最悪は
 * 「初回の切り替えが少し遅い」だけ）。
 */
export async function preloadEditor(): Promise<void> {
  await import('./editor');
}

/**
 * 検索・置換パネルを開く（F-EDIT-05）。
 *
 * **エディタが載っていなければ何も起きない。** ここでわざわざ載せないのは、
 * Preview を見ているときの `Ctrl+F` は本文検索へ行くからで、
 * この関数まで来た時点で Edit に居ることが決まっている
 * （振り分けは `features/view/find.ts`）。
 */
export async function openEditorSearchLazily(replace: boolean): Promise<void> {
  const { openEditorSearch } = await import('./editor');
  openEditorSearch(replace);
}
