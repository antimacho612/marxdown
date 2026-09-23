/**
 * エディターをマウントする入口（`main` チャンク）。
 * 動的 import の一行だけを持つモジュールとして切り出してある（`open-search.ts` 等と同じ形）。
 * ここに置いても `editor` チャンクは遅延のままである。
 * 既定の表示モードが Preview なのは、この分割境界を成立させるためでもある（02.architecture/05-startup-sequence.md §1 の要点 3）。
 */
const EDITOR_SELECTOR = '#mx-editor';

/** 既にマウント済みなら `mountEditor` 側が何もしない。呼ぶ側で重複を判定する必要はない。 */
export async function mountEditorLazily(): Promise<void> {
  const host = document.querySelector<HTMLElement>(EDITOR_SELECTOR);
  if (!host) return;
  const { mountEditor, focusEditor } = await import('./lazy/editor');
  mountEditor(host);
  focusEditor();
}

/**
 * 面を表示した後にレイアウトを測り直させる（`features/mode/mode.ts` が呼ぶ）。
 *
 * `display: none` の間、Monaco は寸法を保持しない（[ADR-0009](../../../docs/adr/0009-editor-engine-monaco.md) の受け入れコスト 3）。
 * 呼ぶのはエディターが表示されるモードに入ったときだけであるため、ここで `editor` チャンクが新たに取得されることはない（既に `mountEditorLazily` を通っている）。
 */
export async function relayoutEditorLazily(): Promise<void> {
  const { relayoutEditor } = await import('./lazy/editor');
  relayoutEditor();
}

/**
 * チャンクだけ先に取っておく（`editor` の idle プリロード）。
 *
 * マウントはしない。
 * 取得と評価だけを済ませておくと、初めて `Ctrl+Shift+V` を押したときの待ち時間が無くなる。
 * `ready()` の後のアイドル時に呼ぶこと（02.architecture/05-startup-sequence.md §1: IPC を伴わず、遅れた場合の最悪の結果も初回の切り替えが遅くなる程度である）。
 *
 * このプリロードは必須である（ADR-0009 の根拠 2）。
 * raw 3.0MB の評価を切り替え時に行うと、モード切り替えの許容上限 400ms（05.performance-budget/04-targets.md §3）に収まらない。
 */
export async function preloadEditor(): Promise<void> {
  await import('./lazy/editor');
}

/**
 * 指定行へ移動する（`Ctrl+G` / 03.ux-spec/04-keybindings.md §3「移動」）。
 *
 * Monaco の `editor.action.gotoLine` に委ねる。行番号の入力欄は Monaco 自身が持っており、こちらでパレットを作ると、同じ用途の入力欄が 2 つになる。
 *
 * マウントされていなければ何もしない。Preview には行番号が無いため、このコマンドは Preview では一覧に出ない（`app/commands.ts`）。
 */
export async function gotoLineLazily(): Promise<void> {
  const { gotoLine } = await import('./lazy/editor');
  gotoLine();
}

/**
 * カーソルのある表の列幅を揃える（F-EDIT-11 / `Shift+Alt+F`）。
 *
 * エディターがマウントされていなければ何もしない。
 * Preview では一覧に出さない（`app/commands.ts`）。カーソルが無い面に「カーソルのある表」は存在しない。
 */
export async function formatTableLazily(): Promise<void> {
  const { formatTableAtCursor } = await import('./lazy/editor');
  formatTableAtCursor();
}

/**
 * 検索・置換パネルを開く（F-EDIT-05）。
 *
 * エディターがマウントされていなければ何も起きない。
 * ここでマウントしないのは、Preview を表示しているときの `Ctrl+F` が本文検索へ振り分けられるためであり、この関数に到達した時点で Edit であることが確定している（振り分けは `features/mode/find.ts`）。
 */
export async function openEditorSearchLazily(replace: boolean): Promise<void> {
  const { openEditorSearch } = await import('./lazy/editor');
  openEditorSearch(replace);
}

/**
 * 検索・置換パネルを閉じる（Split でプレビュー側の検索へ移るとき）。
 *
 * 一度も開いていない場合は呼ばないこと。
 * 無条件に呼ぶと、Preview だけで表示している起動でも初回の `Ctrl+F` で `editor` チャンクが取得される。
 * 閉じる対象が存在するのは開いたことがある場合だけで、その判定は `features/mode/find.ts` が持つ（プレビュー側の `closePreviewFind` と同じ形）。
 */
export async function closeEditorSearchLazily(): Promise<void> {
  const { closeEditorSearch } = await import('./lazy/editor');
  closeEditorSearch();
}

/**
 * Split のスクロール同期を始める / やめる（F-MODE-05 / `features/mode/mode.ts` が呼ぶ）。
 *
 * 停止する側もこの入口を通す。
 * `mode.ts` から `./lazy/editor` を import すると、Preview だけで表示している起動でも `editor` チャンクが取得される。
 */
export async function setSplitSyncLazily(on: boolean): Promise<void> {
  const { setSplitSync } = await import('./lazy/editor');
  setSplitSync(on);
}
