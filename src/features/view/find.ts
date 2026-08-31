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
 * # Split では「見ている面」がモードで決まらない
 *
 * 両方が見えているので、`viewStore.mode` では判定にならない。
 * **フォーカスのある側を探す**（[03.ux-spec > keybindings §4](../../../docs/03.ux-spec/04-keybindings.md)）。
 * Split に入った直後はエディタにフォーカスがあるので、既定はエディタ検索になる。
 * プレビューを叩いてから押せば本文検索が開く。
 *
 * # 2 つの検索を同時に開かない
 *
 * プレビュー検索の `F3` / `Escape` は `bindKeys`（`lib/shortcuts.ts`）でグローバルに置いてある。
 * **あちらには「入力中は発火しない」が無い**ので、エディタにフォーカスを移しても効き続ける。
 * Split で両方開けると `F3` が 2 つの検索を同時に進めることになるため、
 * **開くほうが、もう片方を閉じる。**
 *
 * # 置換は Edit だけ
 *
 * `Ctrl+H` は Preview では何も起きない。読んでいるものを書き換える経路は無いし、
 * 押した人が期待しているのは編集であって、モードが勝手に変わることではない。
 * メニューには Preview のときだけ出さない（`app/commands.ts` の `isListed`）。
 * **Split では効く。** 片方はエディタなので、置換の行き先が決まっている。
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
 * エディタ検索を開いたことがあるか。
 *
 * **`editor` チャンクを落とさないための番人。** 閉じにいくのは開いたことがある場合だけで、
 * そうしないと Preview だけで読んでいる起動の初回 `Ctrl+F` でエディタが落ちてくる
 * （`closePreview` が `null` のときに何もしないのと同じ理由）。
 *
 * ユーザーが `Escape` で自分で閉じた場合は立ったままになるが、
 * そのときの `closeFindWidget` は precondition で弾かれるだけで害が無い。
 */
let editorSearchOpened = false;

/** エディタ側にフォーカスがあるか。Monaco の find ウィジェットも `#mx-editor` の中にある。 */
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

/** エディタ検索を閉じる。開いたことが無ければ `editor` チャンクを触らない。 */
async function closeEditorFind(): Promise<void> {
  if (!editorSearchOpened) return;
  await closeEditorSearchLazily();
}

/** テスト用。 */
export function resetFind(): void {
  closePreview = null;
  editorSearchOpened = false;
}
