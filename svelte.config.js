import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/**
 * Svelte の設定（ADR-0005）。
 *
 * `vitePreprocess` は `<script lang="ts">` と `<style>` を Vite のパイプラインに
 * 通すためだけのもの。ここに変換を足すとビルドが遅くなるだけなので増やさない。
 *
 * `runes: true` を明示しているのは、レガシーな reactive 宣言（`$:`）を
 * 誤って書いたときにコンパイルエラーにするため。**ストアも UI も runes 一本**で通す。
 */
export default {
  preprocess: vitePreprocess(),
  compilerOptions: {
    runes: true,
  },

  vitePlugin: {
    /**
     * `runes: true` は**自分たちのコードにだけ**効かせる。
     *
     * 依存パッケージには legacy 構文（`export let`）の `.svelte` が残っている
     * （`@storybook/addon-svelte-csf` の `LegacyTemplate.svelte` など）。
     * 全体に強制すると、そこでビルドが落ちる。
     * `undefined` を返すと Svelte の自動判定に戻る。
     */
    dynamicCompileOptions({ filename }) {
      if (filename.includes('node_modules')) return { runes: undefined };
      return {};
    },
  },
};
