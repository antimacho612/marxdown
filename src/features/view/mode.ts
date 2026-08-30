/**
 * 表示モードの決定と切り替え（F-MODE-01, 02, 06, 07 / 03.ux-spec/02-view-modes.md）。
 *
 * # クリティカルパスに載ってよい形
 *
 * 06.roadmap/m2-editor.md §1.2 の制約。ここにあるのは**モードの値と、切り替えの手続き**だけで、
 * エディタの実体は `features/editor/open-editor.ts` 経由の動的 import になっている。
 * CodeMirror を直接 import しないこと。`editor` チャンク 203KB が `main` に載る。
 *
 * # 隠すのは CSS の担当
 *
 * `data-mx-mode` を `<html>` に立てるだけで、要素の付け外しはしない
 * （`styles/shell.css`）。エディタを壊すと Undo 履歴が消え、
 * 03.ux-spec/02-view-modes.md §4「モードを切り替えても保持する」が壊れる。
 *
 * # スクロール位置は明示的に戻す
 *
 * `display: none` された要素は `scrollTop` を保てない。§4 が保持を要求している以上、
 * 隠す直前に控えて、戻すときに当て直す。行番号ベースの対応付け（Split の
 * スクロール同期）は Phase 5 の担当で、ここは**同じ面へ戻ってきたときの復元**だけを見る。
 */
import { mountEditorLazily } from '@/features/editor/open-editor';
import { closePreviewFind } from '@/features/view/find';
import { viewStore } from '@/features/view/store.svelte';
import type { Bootstrap, DocumentMeta, ViewMode } from '@/platform';

const PREVIEW_SELECTOR = '#mx-preview';

/**
 * `Ctrl+Shift+V` が戻る先（03.ux-spec/02-view-modes.md §2「Preview ⇄ 直前の編集モード」）。
 *
 * Split（Phase 5）が入ると、ここが `'split'` にもなる。
 */
let lastEditingMode: Exclude<ViewMode, 'preview'> = 'edit';

/** プレビューを離れたときのスクロール位置。 */
let previewScroll = 0;

/**
 * 起動時のモードを決める（F-MODE-07 / 03.ux-spec/02-view-modes.md §3）。
 *
 * ```text
 * 1. CLI で --mode が指定されている        → それに従う
 * 2. ファイル単位の記憶がある（設定 ON 時）  → M5（F-MODE-08）
 * 3. ファイルが読み取り専用               → Preview
 * 4. それ以外                            → 既定の Preview
 * ```
 *
 * 2 と、4 の設定キー（`defaultMode`）は M5。**いま無いのは器であって判断ではない。**
 * 既定値が `"preview"` である以上、設定キーが無い状態の結果は 4 と同じになる。
 */
export function decideInitialMode(bootstrap: Bootstrap | null, meta: DocumentMeta | null): ViewMode {
  if (bootstrap?.mode) return bootstrap.mode;
  if (meta?.readonly === true) return 'preview';
  return 'preview';
}

/**
 * 起動時に 1 回だけ当てる。**シェルを描くより前**に呼ぶこと。
 *
 * 後から当てると、Preview の面が 1 フレーム描かれてからエディタに差し替わる
 * （倍率やペインと同じ理由 / 02.architecture/05-startup-sequence.md §1）。
 */
export function initMode(mode: ViewMode): void {
  viewStore.mode = mode;
  if (mode !== 'preview') lastEditingMode = mode;
  applyModeAttribute(mode);
}

/**
 * モードを変える。**エディタが要るモードなら、その場でチャンクを取りに行く。**
 *
 * 取得を待つあいだ画面は前のモードのままにする。先に切り替えると、
 * 初回だけ何も無い面が数百 ms 見えることになる。
 */
export async function setMode(mode: ViewMode): Promise<void> {
  if (viewStore.mode === mode) return;

  if (mode !== 'preview') {
    // `open-editor` は `main` に居る（動的 import の一行だけを持つ入口）。
    // ここを動的 import にすると、rolldown が「静的にも動的にも参照されている」と
    // 判断して分割が効かなくなる（INEFFECTIVE_DYNAMIC_IMPORT）。
    // 遅延しているのは、その先の `./editor` である。
    await mountEditorLazily();
    lastEditingMode = mode;
  }

  if (viewStore.mode === 'preview') {
    previewScroll = previewScrollTop();
    // プレビュー内検索を閉じる。パネルは `document.body` にあるので、
    // 隠れた面の上に浮いたまま残ってしまう（`features/view/find.ts`）。
    closePreviewFind();
  }

  viewStore.mode = mode;
  applyModeAttribute(mode);

  if (mode === 'preview') restorePreviewScroll();
}

/**
 * Preview ⇄ 直前の編集モード（`Ctrl+Shift+V` / 03.ux-spec/02-view-modes.md §2）。
 *
 * §2 が「最も使うトグル」としているもの。読んでいて直したくなる、直したら確かめる、
 * という往復が中心ユースケースそのものなので、ここが一等地のキーを取る。
 */
export async function togglePreview(): Promise<void> {
  await setMode(viewStore.mode === 'preview' ? lastEditingMode : 'preview');
}

/**
 * `<html>` に立てる。**CSS 側が唯一の消費者。**
 *
 * `data-theme` と同じ形にしてあるので、カスタム CSS からモードごとの
 * 指定を書くこともできる（F-CONF-07 の範囲外だが、妨げる理由もない）。
 */
function applyModeAttribute(mode: ViewMode): void {
  document.documentElement.dataset['mxMode'] = mode;
}

function previewScrollTop(): number {
  return document.querySelector<HTMLElement>(PREVIEW_SELECTOR)?.scrollTop ?? 0;
}

/**
 * プレビューのスクロールを戻す。
 *
 * `display: none` から戻した直後はレイアウトが未確定で、`scrollTop` を
 * 代入しても頭打ちになる。次のフレームで当て直す。
 */
function restorePreviewScroll(): void {
  const container = document.querySelector<HTMLElement>(PREVIEW_SELECTOR);
  if (!container || previewScroll === 0) return;

  container.scrollTop = previewScroll;
  requestAnimationFrame(() => {
    if (container.scrollTop < previewScroll) container.scrollTop = previewScroll;
  });
}

/** テスト用。 */
export function resetMode(): void {
  lastEditingMode = 'edit';
  previewScroll = 0;
}
