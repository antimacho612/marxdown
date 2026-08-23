import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}'],
    benchmark: {
      include: ['src/**/*.bench.ts', 'bench/**/*.bench.ts'],
    },
    // 既定は node。DOM が要るテストはファイル冒頭に `// @vitest-environment jsdom` を書く。
    environment: 'node',
  },
})
