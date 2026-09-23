/**
 * 設定の変化を購読する（`editor` チャンク / F-CONF-04）。
 * 適用する値の組み立ては `options.ts` にあり、ここはルーン（`$effect.root`）を使う購読だけを持つ。
 * Monaco も設定の意味も持ち込まない。
 */
import { settingsStore } from '@/features/settings';

/**
 * 設定の変化に追従する。解除する関数を返す。
 *
 * `theme.ts` の MutationObserver は `<html>` の属性（CSS に現れる変化）しか検出できない。
 * 折り返し・タブ幅・行番号はトークン層に現れないため、ここでストアを直接購読する。
 * 配色（`editor.theme`）もここを通る。値の変化そのものは設定であり、注入した `<style>` はトークン層に現れるが、注入するのは購読を受けた側である（`palette.ts`）。
 * コンポーネントではないため `$effect.root` で effect のスコープを作り、`editor` チャンクの中に閉じることで `main` 側に購読の仕組みを追加しない。
 * effect はマイクロタスクで実行されるためマウント直後に 1 回余分に呼ばれるが、`updateOptions` は同じ値なら何もしないため問題はない。
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
