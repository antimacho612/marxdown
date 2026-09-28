import { fileURLToPath, URL } from 'node:url';

import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // ストアが `.svelte.ts`（ルーン）になっているため、テストでも Svelte のコンパイルが要る。
  plugins: [svelte()],

  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    // Svelte はブラウザ版とサーバ版で実装が分かれる。テストは常にブラウザ版を使う（サーバ版のルーンは値を更新しない）。
    conditions: ['browser'],
  },
  test: {
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}', 'site/src/**/*.test.ts'],
    benchmark: {
      include: ['src/**/*.bench.ts', 'bench/**/*.bench.ts'],
    },
    // 既定は node。DOM が要るテストはファイル冒頭に `// @vitest-environment jsdom` を書く。
    environment: 'node',
  },
});
