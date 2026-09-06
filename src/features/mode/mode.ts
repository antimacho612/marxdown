/**
 * 表示モードの決定と切り替え（F-MODE-01, 02, 06, 07 / 03.ux-spec/02-view-modes.md）。
 *
 * ここにあるのはモードの値と切り替え手続きだけである（06.roadmap/m2-editor.md §1.2 の制約）。
 * エディターは `features/editor/open-editor.ts` 経由の動的 import で、直接 import すると `editor` チャンクが `main` に載る。
 * 表示の切り替えは `data-mx-mode` 属性で CSS が行い要素の付け外しはしない（エディターを壊すと Undo 履歴が消え §4 に反する）。
 * `display: none` された要素は `scrollTop` を保てないため、隠す直前にスクロール位置を控えて戻すときに当て直す。
 */
import { cancelLiveRender, renderNow } from '@/features/document';
import { mountEditorLazily, relayoutEditorLazily, setSplitSyncLazily } from '@/features/editor';
import { viewStore } from '@/features/view';
import type { Bootstrap, DocumentMeta, ViewMode } from '@/platform';

import { closePreviewFind } from './find';

const PREVIEW_SELECTOR = '#mx-preview';

/**
 * `Ctrl+Shift+V` が戻る先（03.ux-spec/02-view-modes.md §2「Preview ⇄ 直前の編集モード」）。
 *
 * Split から Preview へ移り、そこから戻ると Split に戻る。
 * 戻り先は直前の編集モードであり、常に Edit ではない。
 */
let lastEditingMode: Exclude<ViewMode, 'preview'> = 'edit';

/**
 * 順送りの並び（`Ctrl+Shift+M` / 03.ux-spec/02-view-modes.md §2 の図）。
 *
 * WYSIWYG は M5 で追加する。
 * 未実装のものを並びに含めない（操作しても何も起きない位置ができるため）。
 * M5 では要素を 1 つ追加するだけで済む。
 */
const CYCLE: ViewMode[] = ['preview', 'edit', 'split'];

/** プレビューを離れたときのスクロール位置。 */
let previewScroll = 0;

/**
 * 起動時のモードを決める（F-MODE-07 / 03.ux-spec/02-view-modes.md §3）。
 *
 * 優先順位は、CLI で `--mode` が指定されていればそれに従い、次にファイル単位の記憶（設定 ON 時、M5 / F-MODE-08）、ファイルが読み取り専用なら Preview、それ以外は既定の Preview、の順である。
 *
 * ファイル単位の記憶と、設定キー `defaultMode` は M5 で追加する。
 * 既定値が `"preview"` であるため、設定キーが無い現状の結果は既定の Preview と同じになる。
 */
export function decideInitialMode(bootstrap: Bootstrap | null, meta: DocumentMeta | null): ViewMode {
  if (bootstrap?.mode) return bootstrap.mode;
  if (meta?.readonly === true) return 'preview';
  return 'preview';
}

/**
 * 起動時に 1 回だけ適用する。シェルを描画するより前に呼ぶこと。
 *
 * 後から適用すると、Preview の面が 1 フレーム描画されてからエディターへ差し替わる
 * （倍率やペインと同じ理由 / 02.architecture/05-startup-sequence.md §1）。
 */
export function initMode(mode: ViewMode): void {
  viewStore.mode = mode;
  if (mode !== 'preview') lastEditingMode = mode;
  applyModeAttribute(mode);
}

/**
 * モードを変える。エディターが必要なモードでは、その時点でチャンクを取得する。
 *
 * 取得を待つ間は前のモードを表示したままにする。
 * 先に切り替えると、初回だけ空の面が数百 ms 表示される。
 */
export async function setMode(mode: ViewMode): Promise<void> {
  if (viewStore.mode === mode) return;

  if (mode !== 'preview') {
    // `open-editor` は `main` にある（動的 import の 1 行だけを持つ入口）。
    // ここを動的 import にすると、rolldown が静的と動的の両方から参照されていると判断し、分割が行われなくなる（INEFFECTIVE_DYNAMIC_IMPORT）。
    // 遅延しているのはその先の `./lazy/editor` である。
    await mountEditorLazily();
    lastEditingMode = mode;
  }

  // Split でもプレビューは表示されている。
  // Preview モードかどうかで判定すると、Split へ移るたびに検索が閉じ、スクロール位置が保存されてしまう。
  // 非表示になるのは Edit のときだけである。
  const wasVisible = isPreviewVisible(viewStore.mode);
  const willBeVisible = isPreviewVisible(mode);

  if (wasVisible && !willBeVisible) {
    previewScroll = previewScrollTop();
    // プレビュー内検索を閉じる。
    // パネルは `document.body` にあるため、非表示の面の上に残る（`features/mode/find.ts`）。
    closePreviewFind();
  }

  viewStore.mode = mode;
  applyModeAttribute(mode);

  if (!wasVisible && willBeVisible) restorePreviewScroll();

  // Monaco は `display: none` の間、寸法を保持しない（ADR-0009）。
  // プレビューのスクロール位置を戻すのと同じ理由・同じ位置で、レイアウトを測り直させる。
  // エディターが表示されるモードに入るときだけ実行するため、ここでチャンクは増えない。
  if (isEditorVisible(mode)) void relayoutEditorLazily();

  // スクロール同期は Split でのみ意味を持つ（03.ux-spec/03-split-mode.md §2）。
  // 片方の面しか表示されていないときに購読を残さない（N-PERF-05）。
  void setSplitSyncLazily(mode === 'split');

  // Edit の間はプレビューの DOM を作り直していない（表示していない面に対して paint しないため / `document/live.ts`）。
  // 表示する側へ戻った時点で 1 回だけ描画する。
  //
  // Preview と Split の間の移動では描き直さない。
  // どちらでも面は表示されており、入力内容はその都度反映されている。
  //
  // ここに到達した時点で再描画の予約が残っていることがある（入力直後に切り替えた場合）。
  // ここで描き直すため、その予約は不要になる。
  if (!wasVisible && willBeVisible) {
    cancelLiveRender();
    void renderNow();
  }
}

/**
 * Split をトグルする（`Ctrl+\` / 03.ux-spec/02-view-modes.md §2）。
 *
 * VS Code の「エディターを分割」に対応する。Split から抜ける先は Edit である。
 * Preview へ戻すと分割の解除ではなく閲覧側への移動になり、もう一度押しても元の面に戻れない。
 */
export async function toggleSplit(): Promise<void> {
  await setMode(viewStore.mode === 'split' ? 'edit' : 'split');
}

/** 表示モードを順送りする（`Ctrl+Shift+M` / §2 の図）。対象は `CYCLE` の 3 つ。 */
export async function cycleMode(): Promise<void> {
  const at = CYCLE.indexOf(viewStore.mode);
  const next = CYCLE[(at + 1) % CYCLE.length] ?? 'preview';
  await setMode(next);
}

/**
 * Preview ⇄ 直前の編集モード（`Ctrl+Shift+V` / 03.ux-spec/02-view-modes.md §2）。
 *
 * §2 が最も使用頻度の高いトグルとしているものである。
 * 閲覧と編集の往復が中心ユースケースであるため、最も押しやすいキーを割り当てている。
 */
export async function togglePreview(): Promise<void> {
  await setMode(viewStore.mode === 'preview' ? lastEditingMode : 'preview');
}

/**
 * `<html>` に属性を設定する。この値を参照するのは CSS だけである。
 *
 * `data-theme` と同じ形にしてあるため、カスタム CSS からモードごとの指定も書ける（F-CONF-07 の範囲外だが、制限する理由もない）。
 */
function applyModeAttribute(mode: ViewMode): void {
  document.documentElement.dataset['mxMode'] = mode;
}

/** プレビューの面が表示されているか。Split でも表示されている。 */
export function isPreviewVisible(mode: ViewMode): boolean {
  return mode !== 'edit';
}

/** エディターの面が表示されているか。 */
export function isEditorVisible(mode: ViewMode): boolean {
  return mode !== 'preview';
}

function previewScrollTop(): number {
  return document.querySelector<HTMLElement>(PREVIEW_SELECTOR)?.scrollTop ?? 0;
}

/**
 * プレビューのスクロールを戻す。
 *
 * `display: none` から戻した直後はレイアウトが未確定であり、`scrollTop` を代入しても上限で切り詰められる。
 * そのため次のフレームで設定し直す。
 */
function restorePreviewScroll(): void {
  const container = document.querySelector<HTMLElement>(PREVIEW_SELECTOR);
  if (!container || previewScroll === 0) return;

  container.scrollTop = previewScroll;
  requestAnimationFrame(() => {
    if (container.scrollTop < previewScroll) container.scrollTop = previewScroll;
  });
}

/** テスト用。直前の編集モードとスクロール位置の記憶を初期化する。 */
export function resetMode(): void {
  lastEditingMode = 'edit';
  previewScroll = 0;
}
