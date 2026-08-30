/**
 * 未保存のまま別の文書へ移る前の確認（F-EDIT-03 / N-REL-01）。
 *
 * # 「閉じる際の確認」だけでは足りない
 *
 * F-EDIT-03 の文面は「閉じる際の確認」で、Phase 2 で実装したのは終了経路だけだった。
 * だが**単一文書のアプリでは「別のファイルを開く」が「閉じる」そのもの**である。
 * `open.ts` の入口は 5 つあり、どれも編集中の本文を置き換える。
 *
 * ```text
 * argv 転送 / ダイアログ (Ctrl+O) / D&D / 相対リンク / 再読み込み (F5)
 * ```
 *
 * **`F5` は Phase 2 の時点で既に穴だった。** `whenEditing: true` なので Edit モードでも
 * 効き、押せば編集内容が黙って消えていた。Phase 3 で `Ctrl+O` と `Alt+←` も
 * エディタ側から届くようにするので、ここで塞ぐ。
 *
 * # なぜ登録口を挟むのか
 *
 * 「保存してから移る」を実装するには `saveCurrent` が要る。しかし
 * `save.ts` は `open.ts` を import している（名前を付けて保存の後に開き直す /
 * 衝突したときに読み直す）ので、`open.ts → save.ts` を足すと循環する。
 * Phase 2 で `dirty.ts` を切り出したのと同じ形で、**互いを import しない
 * 第三者**を置く（`refresh.ts` と同じ考え方）。
 *
 * 名乗り出るのは `save.ts` の側。`app/commands.ts` が静的に import しているので
 * 起動時に必ず評価される（遅延チャンクではない）。
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
