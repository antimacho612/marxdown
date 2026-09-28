import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vite';

import { CACHE_DIR, pages, sharedConfig } from './build/plugin';

/**
 * 紹介サイト（GitHub Pages）のビルド設定。
 *
 * ページは Svelte コンポーネントをビルド時に HTML へ変換したもので、Svelte のランタイムは配信しない。
 * 動きは `src/client/` のスクリプトが担う。
 */
const shared = sharedConfig();

export default defineConfig({
  ...shared,
  root: fileURLToPath(new URL('.', import.meta.url)),
  publicDir: 'public',
  cacheDir: CACHE_DIR,
  plugins: [...shared.plugins, pages()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
  },
  server: { port: 4173, strictPort: true },
  preview: { port: 4174, strictPort: true },
});
