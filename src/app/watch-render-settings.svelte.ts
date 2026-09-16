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
import type { Settings } from '@/platform';

/**
 * パース結果に影響する値だけを 1 本の文字列にする。
 *
 * 購読しているだけでは足りない。
 * `settingsStore.values` は 1 項目の変更でもオブジェクトごと差し替わるため、
 * フォントサイズや配色のように CSS だけで反映できる項目を変えても効果が発火する。
 * さらに保存の完了時（`features/settings/lazy/change.ts` の `persist`）と
 * 外部エディターでの編集の検知（`refreshSettings`）でも同じ差し替えが起きるため、
 * 1 回の変更で `renderNow()` が複数回走ることになる。
 * `renderNow()` はプレビューの DOM を作り直すので、そのたびに本文が消えてから描き直される。
 */
function renderSignature(values: Settings): string {
  return `${String(values['preview.softBreak'])}\n${enabledSyntax(values).join(',')}`;
}

/** `startup()` から 1 回だけ呼ぶ。解除はしない（アプリの寿命いっぱい購読し続ける）。 */
export function installSoftBreakRerender(): void {
  let previous: string | null = null;

  $effect.root(() => {
    $effect(() => {
      const signature = renderSignature(settingsStore.values);
      if (signature === previous) return;

      // マウント直後に 1 回走る（`watchEditorSettings` と同じ）。開いている本文は開いた時点の値で既に描画済みなので、ここでは何もしない。
      const isFirstRun = previous === null;
      previous = signature;
      if (isFirstRun) return;

      void renderNow();
    });
  });
}
