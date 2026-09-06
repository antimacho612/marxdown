/**
 * `Ctrl+F` / `Ctrl+H` の振り分け（F-VIEW-10 / F-EDIT-05）。
 *
 * 検索は面ごとに別実装（Preview は Range 検索、Edit は Monaco の find ウィジェット）だが、同じキーで表示中の面に対応するほうを開く。
 * `features/editor/lazy/keymap.ts` が `Ctrl+F` を Monaco から解除しているのはこのためである（解除しないと Edit で二重に開く）。
 *
 * Split では両方見えるため `viewStore.mode` では判定できず、フォーカスのある側を探す（03.ux-spec/04-keybindings.md §4。既定はエディター検索）。
 * プレビュー検索の `F3`/`Escape` はグローバルに効き続けるため、開くほうがもう片方を閉じて同時進行を防ぐ。
 * `Ctrl+H`（置換）は Edit と Split のみで、Preview では書き換える経路が無いため何もしない。
 */
import { closeEditorSearchLazily, openEditorSearchLazily } from '@/features/editor';
import { openSearchLazily } from '@/features/preview';
import { viewStore } from '@/features/view';

const EDITOR_SELECTOR = '#mx-editor';

/**
 * プレビュー内検索を閉じる手段。開いたときに受け取って持っておく。
 *
 * 登録用の関数を設けずにこの形にしてある。
 * `preview/lazy/search.ts` 側から登録する形（`refresh.ts` と同じ）にすると、`open-search.ts → search.ts → find.ts → open-search.ts` で循環する。
 */
let closePreview: (() => void) | null = null;

/**
 * エディター検索を開いたことがあるか。
 *
 * `editor` チャンクを読み込ませないための判定に使う。
 * 閉じる処理を実行するのは開いたことがある場合だけで、そうしないと Preview だけで表示している起動の初回 `Ctrl+F` でエディターが読み込まれる
 * （`closePreview` が `null` のときに何もしないのと同じ理由）。
 *
 * `Escape` で閉じた場合はこのフラグが立ったままになるが、その状態の `closeFindWidget` は precondition により実行されないだけで影響はない。
 */
let editorSearchOpened = false;

/** エディター側にフォーカスがあるか。Monaco の find ウィジェットも `#mx-editor` の中にある。 */
function editorHasFocus(): boolean {
  const host = document.querySelector<HTMLElement>(EDITOR_SELECTOR);
  const active = document.activeElement;
  return host !== null && active !== null && host.contains(active);
}

/** どちらの面を探すか。 */
function targetOf(): 'preview' | 'editor' {
  if (viewStore.mode === 'preview') return 'preview';
  if (viewStore.mode === 'edit') return 'editor';
  return editorHasFocus() ? 'editor' : 'preview';
}

/** 検索を開く（`Ctrl+F`）。 */
export async function openFind(): Promise<void> {
  if (targetOf() === 'preview') {
    await closeEditorFind();
    closePreview = await openSearchLazily();
    return;
  }
  closePreviewFind();
  editorSearchOpened = true;
  await openEditorSearchLazily(false);
}

/** 置換を開く（`Ctrl+H`）。Preview では何もしない。 */
export async function openReplace(): Promise<void> {
  if (viewStore.mode === 'preview') return;
  closePreviewFind();
  editorSearchOpened = true;
  await openEditorSearchLazily(true);
}

/**
 * Preview を離れるときに呼ぶ（`features/mode/mode.ts`）。
 *
 * 一度も検索していなければ何も起きない。
 * `search` チャンクを読み込ませないことが要点であり、閉じる対象が存在するのは開いたことがある場合だけである。
 */
export function closePreviewFind(): void {
  closePreview?.();
  closePreview = null;
}

/** エディター検索を閉じる。開いたことが無ければ `editor` チャンクを読み込まない。 */
async function closeEditorFind(): Promise<void> {
  if (!editorSearchOpened) return;
  await closeEditorSearchLazily();
}

/** テスト用。閉じる処理と開いた記録を初期化する。 */
export function resetFind(): void {
  closePreview = null;
  editorSearchOpened = false;
}
