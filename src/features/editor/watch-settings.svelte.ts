/**
 * 設定の変化を拾う（`editor` チャンク / F-CONF-04）。
 *
 * **このファイルの中身は購読だけ。** 当てる値の組み立ては `options.ts` にある。
 * ルーン（`$effect.root`）を使うぶんだけを `.svelte.ts` に切り出してあり、
 * ここには Monaco も設定の意味も持ち込まない。
 */
import { settingsStore } from '@/features/settings/store.svelte';
import { styleEpoch } from '@/features/settings/style-epoch.svelte';

/**
 * 設定の変化に追従する。**解除する関数を返す。**
 *
 * # なぜ `theme.ts` の MutationObserver では足りないのか
 *
 * あちらが見ているのは `<html>` の属性で、拾えるのは**CSS に現れる変化**だけ。
 * 折り返し・タブ幅・行番号はトークン層に出ないので、ストアを直接見るしかない。
 * `editor.css` の注入も `<html>` には映らないので、同じ理由でここが拾う。
 *
 * # `$effect.root` を使う
 *
 * ここはコンポーネントではないので、効果を張る器を自分で作る。
 * **`editor` チャンクの中に閉じている**ので、`main` 側に購読の口は増えない。
 *
 * 効果はマイクロタスクで走るため、**マウント直後に 1 回よけいに呼ばれる**。
 * `updateOptions` は同じ値なら何もしないので、そのままにしてある。
 */
export function watchEditorSettings(reapply: () => void): () => void {
  return $effect.root(() => {
    $effect(() => {
      // 依存を明示的に読む。`reapply` の中で読まれることに頼ると、
      // 呼び出し側を差し替えたときに黙って追従しなくなる。
      void settingsStore.values;
      // `editor.css` の差し替え（ADR-0013）。**設定ではないので別の合図で来る。**
      void styleEpoch.value;
      reapply();
    });
  });
}
