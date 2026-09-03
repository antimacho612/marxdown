/**
 * 未保存のまま別の文書へ移る前の確認（F-EDIT-03 / N-REL-01）。
 *
 * 単一文書のアプリでは「別のファイルを開く」も「閉じる」に当たるため、`open.ts` の 5 つの入口（argv 転送・ダイアログ・D&D・相対リンク・再読み込み）すべてで確認する。
 *
 * 「保存してから移る」の実体（`saveCurrent`）を直接 import すると、`save.ts` は既に `open.ts` を import しているため循環する。
 * `dirty.ts` / `refresh.ts` と同じ形で、`save.ts` 側から登録口へ登録させている。
 */
import { getPlatform } from '@/platform';

import { documentStore } from './store.svelte';

/** 「保存する」が選ばれたときに呼ぶもの。成否を返す。 */
let saver: (() => Promise<boolean>) | null = null;

export function registerSaver(save: (() => Promise<boolean>) | null): void {
  saver = save;
}

/**
 * 進めてよいか。**ダーティでなければ何も出さずに `true`。**
 *
 * 「保存する」を選んだのに保存が失敗した場合は `false` を返す。
 * 失敗を握り潰して進むと、確認した意味が無くなる（`save.ts` の `saveThenQuit`
 * が終了しないのと同じ判断 / N-REL-01）。
 */
export async function confirmDiscard(): Promise<boolean> {
  if (!documentStore.isDirty) return true;

  const choice = await getPlatform().confirmDiscard();
  if (choice === 'cancel') return false;
  if (choice === 'discard') return true;

  // 保存してから進む。**保存できるのはフロントだけ**（本文は `EditorState` にある）。
  return (await saver?.()) ?? false;
}

/** テスト用。 */
export function resetDiscardGuard(): void {
  saver = null;
}
