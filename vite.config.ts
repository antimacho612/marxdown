import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
import { defineConfig } from 'vite';

const host = process.env.TAURI_DEV_HOST;

/**
 * チャンク境界は 02.architecture.md §5.3 の表がそのまま仕様になっている。
 * `main` + `md-worker` がクリティカルパスであり、size-limit の監視対象。
 */
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    ...(mode === 'analyze'
      ? [visualizer({ filename: 'dist/stats.html', gzipSize: true, brotliSize: true, open: false })]
      : []),
  ],

  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },

  // Worker はクリティカルパスで並行ロードされるため、名前を固定して size-limit から参照する。
  worker: {
    format: 'es',
    rollupOptions: {
      output: {
        entryFileNames: 'assets/md-worker-[hash].js',
        chunkFileNames: 'assets/md-worker-[name]-[hash].js',
      },
    },
  },

  build: {
    target: 'esnext', // WebView2 Evergreen / WKWebView のみを対象にするため
    sourcemap: mode !== 'production',
    reportCompressedSize: true,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/main-[hash].js',
        /**
         * highlight.js の言語定義には `hljs-` を冠する。
         *
         * 1 言語 1 チャンクという分割そのものは Vite の自動分割の結果であって、
         * `manualChunks` でまとめてはいけない。まとめると TypeScript の
         * ドキュメントを開いただけで Java や SQL の文法まで落ちてくる。
         * ここでやっているのは**名前付けだけ**で、名前が揃っていないと
         * size-limit からハイライト一式を 1 つの予算として指せない。
         */
        chunkFileNames(chunk) {
          // Vite が解決するのは ESM ビルド（`es/`）で、CJS の `lib/` ではない。
          const isLanguage = /highlight\.js[\\/](?:es|lib)[\\/]languages[\\/]/.test(
            chunk.facadeModuleId ?? '',
          );
          return isLanguage ? 'assets/hljs-[name]-[hash].js' : 'assets/[name]-[hash].js';
        },
        assetFileNames: 'assets/[name]-[hash][extname]',
        manualChunks(id) {
          if (
            id.includes('node_modules/@codemirror') ||
            id.includes('node_modules/@lezer') ||
            id.includes('node_modules/@replit/codemirror-vscode-keymap') ||
            id.includes('node_modules/crelt') ||
            id.includes('node_modules/style-mod') ||
            id.includes('node_modules/w3c-keyname')
          ) {
            return 'editor';
          }
          return undefined;
        },
      },
    },
  },

  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
    watch: { ignored: ['**/src-tauri/**', '**/bench/fixtures/**'] },
  },
}));
