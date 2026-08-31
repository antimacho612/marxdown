/**
 * `Ctrl+F` / `Ctrl+H` の振り分け（F-VIEW-10 / F-EDIT-05）。
 *
 * # 1 つのキーに 2 つの実装がある
 *
 * 検索は面ごとに別物である。
 *
 * ```text
 * Preview  本文の DOM を Range で探す（CSS Custom Highlight API / preview/search.ts）
 * Edit     エディタのモデルを探す（Monaco の find ウィジェット）
 * ```
 *
 * **同じキーで、見ているほうが開く。** ユーザーから見れば「いま読んでいるものを探す」
 * という 1 つの操作なので、キーを 2 つに分けない。
 *
 * この振り分けがあるので、`features/editor/keymap.ts` は `Ctrl+F` を Monaco から剥がしている。
 * 外さないと、Edit ではエディタが先に受けたあと、ここでもう一度開くことになる。
 *
 * # 置換は Edit だけ
 *
 * `Ctrl+H` は Preview では何も起きない。読んでいるものを書き換える経路は無いし、
 * 押した人が期待しているのは編集であって、モードが勝手に変わることではない。
 * メニューには Edit のときしか出さない（`app/commands.ts` の `isListed`）。
 */
import { openEditorSearchLazily } from '@/features/editor/open-editor';
import { openSearchLazily } from '@/features/preview/open-search';
import { viewStore } from '@/features/view/store.svelte';

/**
 * プレビュー内検索を閉じる手段。開いたときに受け取って持っておく。
 *
 * **登録口を作らずにこの形にしてある。** `preview/search.ts` の側から
 * 名乗り出る形（`refresh.ts` と同じ）にすると、
 * `open-search.ts → search.ts → find.ts → open-search.ts` で循環する。
 */
let closePreview: (() => void) | null = null;

/** 検索を開く（`Ctrl+F`）。 */
export async function openFind(): Promise<void> {
  // Split（Phase 5）が入ると「どちらの面を見ているか」がフォーカスで決まる。
  // いまは 2 モードしかないので、モードだけで足りる。
  if (viewStore.mode === 'preview') {
    closePreview = await openSearchLazily();
    return;
  }
  await openEditorSearchLazily(false);
}

/** 置換を開く（`Ctrl+H`）。Preview では何もしない。 */
export async function openReplace(): Promise<void> {
  if (viewStore.mode === 'preview') return;
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
}

/** テスト用。 */
export function resetFind(): void {
  closePreview = null;
}
