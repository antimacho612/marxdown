import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
  // ここに変換を足すとビルドが遅くなるだけなので増やさない。
  preprocess: vitePreprocess(),

  compilerOptions: {
    runes: true,
  },

  vitePlugin: {
    // 依存パッケージに legacy 構文が残っている（`@storybook/addon-svelte-csf` の `LegacyTemplate.svelte` など）ため。
    dynamicCompileOptions({ filename }) {
      if (filename.includes('node_modules')) return { runes: undefined };
      return {};
    },
  },
};
