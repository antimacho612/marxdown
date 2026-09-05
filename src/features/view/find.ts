/**
 * `Ctrl+F` / `Ctrl+H` の振り分け（F-VIEW-10 / F-EDIT-05）。
 *
 * 検索は面ごとに別実装（Preview は Range 検索、Edit は Monaco の find ウィジェット）だが、同じキーで見ているほうが開く。
 * `features/editor/keymap.ts` が `Ctrl+F` を Monaco から剥がしているのはこのためである（外すと Edit で二重に開く）。
 *
 * Split では両方見えるため `viewStore.mode` では判定できず、フォーカスのある側を探す（03.ux-spec/04-keybindings.md §4。既定はエディター検索）。
 * プレビュー検索の `F3`/`Escape` はグローバルに効き続けるため、開くほうがもう片方を閉じて同時進行を防ぐ。
 * `Ctrl+H`（置換）は Edit と Split のみで、Preview では書き換える経路が無いため何もしない。
 */
import { closeEditorSearchLazily, openEditorSearchLazily } from '@/features/editor/open-editor';
import { openSearchLazily } from '@/features/preview/open-search';
import { viewStore } from '@/features/view/store.svelte';

const EDITOR_SELECTOR = '#mx-editor';

/**
 * プレビュー内検索を閉じる手段。開いたときに受け取って持っておく。
 *
 * **登録口を作らずにこの形にしてある。** `preview/search.ts` の側から
 * 名乗り出る形（`refresh.ts` と同じ）にすると、
 * `open-search.ts → search.ts → find.ts → open-search.ts` で循環する。
 */
let closePreview: (() => void) | null = null;

/**
 * エディター検索を開いたことがあるか。
 *
 * **`editor` チャンクを落とさないための番人。** 閉じにいくのは開いたことがある場合だけで、
 * そうしないと Preview だけで読んでいる起動の初回 `Ctrl+F` でエディターが落ちてくる
 * （`closePreview` が `null` のときに何もしないのと同じ理由）。
 *
 * ユーザーが `Escape` で自分で閉じた場合は立ったままになるが、
 * そのときの `closeFindWidget` は precondition で弾かれるだけで害が無い。
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
 * Preview を離れるときに呼ぶ（`features/view/mode.ts`）。
 *
 * 一度も検索していなければ何も起きない。**`search` チャンクを落とさない**のが要点で、
 * 閉じる相手が居るのは、開いたことがある場合だけである。
 */
export function closePreviewFind(): void {
  closePreview?.();
  closePreview = null;
}

/** エディター検索を閉じる。開いたことが無ければ `editor` チャンクを触らない。 */
async function closeEditorFind(): Promise<void> {
  if (!editorSearchOpened) return;
  await closeEditorSearchLazily();
}

/** テスト用。 */
export function resetFind(): void {
  closePreview = null;
  editorSearchOpened = false;
}
