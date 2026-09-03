/**
 * 設定の変化を拾う（`editor` チャンク / F-CONF-04）。
 * 当てる値の組み立ては `options.ts` にあり、ここはルーン（`$effect.root`）を使う購読だけを持つ。
 * Monaco も設定の意味も持ち込まない。
 */
import { settingsStore } from '@/features/settings/store.svelte';
import { styleEpoch } from '@/features/settings/style-epoch.svelte';

/**
 * 設定の変化に追従する。解除する関数を返す。
 *
 * `theme.ts` の MutationObserver は `<html>` の属性（CSS に現れる変化）しか拾えない。
 * 折り返し・タブ幅・行番号や `editor.css` の注入はトークン層に出ないため、ここがストアを直接見て拾う。
 * コンポーネントではないので `$effect.root` で効果を張る器を自作し、`editor` チャンクの中に閉じることで `main` 側に購読の口を増やさない。
 * 効果はマイクロタスクで走るためマウント直後に 1 回余分に呼ばれるが、`updateOptions` は同じ値なら何もしないので無害である。
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
