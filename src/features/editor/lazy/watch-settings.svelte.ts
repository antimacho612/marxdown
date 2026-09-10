/**
 * 設定の変化を拾う（`editor` チャンク / F-CONF-04）。
 * 当てる値の組み立ては `options.ts` にあり、ここはルーン（`$effect.root`）を使う購読だけを持つ。
 * Monaco も設定の意味も持ち込まない。
 */
import { settingsStore } from '@/features/settings';

/**
 * 設定の変化に追従する。解除する関数を返す。
 *
 * `theme.ts` の MutationObserver は `<html>` の属性（CSS に現れる変化）しか拾えない。
 * 折り返し・タブ幅・行番号はトークン層に出ないため、ここがストアを直接見て拾う。
 * 配色（`editor.theme`）もここを通る。値の変化そのものは設定であり、注入した `<style>` はトークン層に現れるが、注入するのは購読を受けた側である（`palette.ts`）。
 * コンポーネントではないので `$effect.root` で効果を張る器を自作し、`editor` チャンクの中に閉じることで `main` 側に購読の口を増やさない。
 * 効果はマイクロタスクで走るためマウント直後に 1 回余分に呼ばれるが、`updateOptions` は同じ値なら何もしないので無害である。
 */
export function watchEditorSettings(reapply: () => void): () => void {
  return $effect.root(() => {
    $effect(() => {
      // 依存を明示的に読む。
      // `reapply` の中で読まれることに依存すると、呼び出し側を差し替えたときに追従しなくなる。
      void settingsStore.values;
      reapply();
    });
  });
}
