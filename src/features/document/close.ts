/**
 * 開いている文書を閉じる（F-NAV-02 / 最後のタブを閉じたとき）。
 *
 * 何も開いていない状態は Welcome 画面である（03.ux-spec/08-empty-states.md §1）。
 * 判定は `documentStore.meta === null` の 1 つだけなので（`app/App.svelte`）、ここで消し残すと本文が無いのに文字数や倍率が残ったステータスバーになる。
 *
 * エディター（Monaco）は破棄しない。
 * モデルの解放はタブを閉じる経路が行う（N-PERF-06 / 02.architecture/07-editor-wysiwyg.md §1）。
 * ここでは本文を空にするところまでを行う。
 */
import { paint, releasePreviewResources } from '@/features/preview';
import { getPlatform } from '@/platform';

import { markClean } from './dirty';
import { cancelLiveRender } from './live';
import { documentStore } from './store.svelte';
import { setDocumentText } from './text';

const PREVIEW_SELECTOR = '#mx-preview';

/**
 * 表示中の文書を破棄して、何も開いていない状態に戻す。
 *
 * 未保存の確認は行わない。呼ぶ側（タブを閉じる経路）が済ませている。
 */
export function closeDocument(): void {
  // 打鍵ごとの再描画が予約されたままだと、消した後に本文が再描画される。
  cancelLiveRender();

  // 空のチャンク列で再描画すると、段階的描画の打ち切り（`cancelPaint`）も同時に行われる。
  const container = document.querySelector<HTMLElement>(PREVIEW_SELECTOR);
  if (container) paint(container, []);

  // 遅延チャンクが保持しているもの（Mermaid の observer と描画済み SVG）を解放する（N-PERF-06）。
  // `paint` は本文を消すだけで、その外側で持っているものは解放しない。
  releasePreviewResources();

  const path = documentStore.meta?.path ?? null;

  documentStore.meta = null;
  documentStore.outline = [];
  documentStore.frontMatter = null;
  documentStore.stats = null;
  documentStore.textStats = null;
  documentStore.cursor = null;

  // 本文は空にするが、エディターの読み書き口は外さない。
  // 外すと Monaco がマウントされたままこちら側の保持分と二重になる（`text.ts` の `detachEditor`）。
  setDocumentText('');
  markClean();

  // 監視を解除する（N-PERF-05）。開いていないファイルの変更を受け取っても行き先が無い。
  if (path !== null) void getPlatform().unwatchPath(path);
}
