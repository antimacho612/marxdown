/**
 * 設定 `preview.softBreak` の変更を検知して本文を描き直す（#45）。
 *
 * `markdown-it` の `breaks` は HTML の生成そのものに関わるため、CSS だけで反映できるテーマやフォントとは違い、
 * 変更を反映するには再パースが要る。
 * `document` と `settings` はどちらも相手の feature を直接参照できないため（02.architecture/03-layers.md §3）、
 * 両方を知っている `app/` 層でこの購読をつなぐ。
 */
import { renderNow } from '@/features/document';
import { settingsStore } from '@/features/settings';

/** `startup()` から 1 回だけ呼ぶ。解除はしない（アプリの寿命いっぱい購読し続ける）。 */
export function installSoftBreakRerender(): void {
  let first = true;

  $effect.root(() => {
    $effect(() => {
      void settingsStore.values['preview.softBreak'];
      // マウント直後に 1 回走る（`watchEditorSettings` と同じ）。開いている本文は開いた時点の値で既に描画済みなので、ここでは何もしない。
      if (first) {
        first = false;
        return;
      }
      void renderNow();
    });
  });
}
