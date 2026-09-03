/**
 * 表示モードの決定と切り替え（F-MODE-01, 02, 06, 07 / 03.ux-spec/02-view-modes.md）。
 *
 * ここにあるのはモードの値と切り替え手続きだけである（06.roadmap/m2-editor.md §1.2 の制約）。
 * エディタは `features/editor/open-editor.ts` 経由の動的 import で、直接 import すると `editor` チャンクが `main` に載る。
 * 表示の切り替えは `data-mx-mode` 属性で CSS が行い要素の付け外しはしない（エディタを壊すと Undo 履歴が消え §4 に反する）。
 * `display: none` された要素は `scrollTop` を保てないため、隠す直前にスクロール位置を控えて戻すときに当て直す。
 */
import { cancelLiveRender, renderNow } from '@/features/document/live';
import { mountEditorLazily, relayoutEditorLazily, setSplitSyncLazily } from '@/features/editor/open-editor';
import { closePreviewFind } from '@/features/view/find';
import { viewStore } from '@/features/view/store.svelte';
import type { Bootstrap, DocumentMeta, ViewMode } from '@/platform';

const PREVIEW_SELECTOR = '#mx-preview';

/**
 * `Ctrl+Shift+V` が戻る先（03.ux-spec/02-view-modes.md §2「Preview ⇄ 直前の編集モード」）。
 *
 * Split から Preview へ抜けて戻ってきたら Split に戻る。
 * **「直前の編集モード」であって「Edit」ではない。**
 */
let lastEditingMode: Exclude<ViewMode, 'preview'> = 'edit';

/**
 * 順送りの並び（`Ctrl+Shift+M` / 03.ux-spec/02-view-modes.md §2 の図）。
 *
 * WYSIWYG は M5。**入っていないものを並びに含めない**（押すと何も起きない位置が
 * できる）。M5 で足すときに 1 語増やすだけで済む。
 */
const CYCLE: ViewMode[] = ['preview', 'edit', 'split'];

/** プレビューを離れたときのスクロール位置。 */
let previewScroll = 0;

/**
 * 起動時のモードを決める（F-MODE-07 / 03.ux-spec/02-view-modes.md §3）。
 *
 * 優先順位は、CLI で `--mode` が指定されていればそれに従い、次にファイル単位の記憶（設定 ON 時、M5 / F-MODE-08）、ファイルが読み取り専用なら Preview、それ以外は既定の Preview、の順である。
 *
 * 2 と、4 の設定キー（`defaultMode`）は M5。
 * いま無いのは器であって判断ではない。
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

  // **Split でもプレビューは見えている。** 判定を「Preview モードか」で書くと、
  // Split へ移るたびに検索が閉じ、スクロール位置が控えられてしまう。
  // 見えなくなるのは Edit のときだけ。
  const wasVisible = isPreviewVisible(viewStore.mode);
  const willBeVisible = isPreviewVisible(mode);

  if (wasVisible && !willBeVisible) {
    previewScroll = previewScrollTop();
    // プレビュー内検索を閉じる。パネルは `document.body` にあるので、
    // 隠れた面の上に浮いたまま残ってしまう（`features/view/find.ts`）。
    closePreviewFind();
  }

  viewStore.mode = mode;
  applyModeAttribute(mode);

  if (!wasVisible && willBeVisible) restorePreviewScroll();

  // **Monaco は `display: none` のあいだ寸法を失う**（ADR-0009）。プレビューの
  // スクロール位置を戻すのと同じ理由・同じ場所で、器を測り直させる。
  // エディタが見えるモードに入るときだけなので、ここでチャンクは増えない。
  if (isEditorVisible(mode)) void relayoutEditorLazily();

  // スクロール同期は Split でしか意味を持たない（03.ux-spec/03-split-mode.md §2）。
  // **片面しか見えていないときに購読を残さない**（N-PERF-05）。
  void setSplitSyncLazily(mode === 'split');

  // **Edit のあいだ、プレビューの DOM は作り直していない**（見えない面のために
  // paint しないため / `document/live.ts`）。出す側へ戻ってきたところで 1 回だけ描く。
  //
  // Preview / Split どうしの行き来では描き直さない。どちらでも面は見えており、
  // 打った内容はその都度反映されている。
  //
  // ここへ来るまでに予約が残っていることがある（打った直後に切り替えた場合）。
  // **いま描き直すのだから、そのぶんは要らない。**
  if (!wasVisible && willBeVisible) {
    cancelLiveRender();
    void renderNow();
  }
}

/**
 * Split をトグルする（`Ctrl+\` / 03.ux-spec/02-view-modes.md §2）。
 *
 * VS Code の「エディターを分割」に対応する。**Split から抜ける先は Edit。**
 * Preview へ戻すと「分割を解いた」ではなく「読む側へ移った」ことになり、
 * もう一度押しても元の面へ帰れない。
 */
export async function toggleSplit(): Promise<void> {
  await setMode(viewStore.mode === 'split' ? 'edit' : 'split');
}

/** 4 モードを順送りする（`Ctrl+Shift+M` / §2 の図）。 */
export async function cycleMode(): Promise<void> {
  const at = CYCLE.indexOf(viewStore.mode);
  const next = CYCLE[(at + 1) % CYCLE.length] ?? 'preview';
  await setMode(next);
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

/** プレビューの面が出ているか。**Split でも出ている。** */
export function isPreviewVisible(mode: ViewMode): boolean {
  return mode !== 'edit';
}

/** エディタの面が出ているか。 */
export function isEditorVisible(mode: ViewMode): boolean {
  return mode !== 'preview';
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
