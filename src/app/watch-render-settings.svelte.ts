/**
 * パースの結果そのものを変える設定を購読し、変更されたら本文を描き直す。
 *
 * 対象は `preview.softBreak`（#45）と追加記法（`markdown.*` / 04.tech-stack/04-markdown.md §3）である。
 * どちらも HTML の生成に関わるため、CSS だけで反映できるテーマやフォントとは違い、反映するには再パースが要る。
 * `document` と `settings` はどちらも相手の feature を直接参照できないため（02.architecture/03-layers.md §3）、
 * 両方を知っている `app/` 層でこの購読をつなぐ。
 */
import { renderNow } from '@/features/document';
import { enabledSyntax, settingsStore } from '@/features/settings';

/** `startup()` から 1 回だけ呼ぶ。解除はしない（アプリの寿命いっぱい購読し続ける）。 */
export function installSoftBreakRerender(): void {
  let first = true;

  $effect.root(() => {
    $effect(() => {
      void settingsStore.values['preview.softBreak'];
      // 記法の一覧を読むことで、`markdown.*` のどれが変わっても再パースが走る。
      void enabledSyntax(settingsStore.values).join(',');
      // マウント直後に 1 回走る（`watchEditorSettings` と同じ）。開いている本文は開いた時点の値で既に描画済みなので、ここでは何もしない。
      if (first) {
        first = false;
        return;
      }
      void renderNow();
    });
  });
}
