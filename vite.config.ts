import { fileURLToPath, URL } from 'node:url';

import { svelte } from '@sveltejs/vite-plugin-svelte';
import { visualizer } from 'rollup-plugin-visualizer';
import { defineConfig } from 'vite';

const host = process.env.TAURI_DEV_HOST;

/**
 * チャンク境界は 02.architecture.md §5.3 の表がそのまま仕様になっている。
 * `main` + `md-worker` がクリティカルパスであり、size-limit の監視対象。
 */
export default defineConfig(({ mode }) => ({
  plugins: [
    svelte(),
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
          const isLanguage = /highlight\.js[\\/](?:es|lib)[\\/]languages[\\/]/.test(chunk.facadeModuleId ?? '');
          if (isLanguage) return 'assets/hljs-[name]-[hash].js';

          /*
           * ハンバーガーメニューの中身（M1.5 Phase 3）。
           *
           * 分割そのものは動的 import の結果であって、ここでやっているのは
           * **名前付けだけ**（hljs と同じ）。`manualChunks` で 'menu' に寄せてはいけない。
           * `main` と共有しているモジュール（`open.ts` / `zoom.ts` など）まで
           * menu チャンク側へ引き寄せられ、**`main` がそれを静的 import する**形になって、
           * 遅延どころか起動時に読み込まれるチャンクになる（実測で確認済み）。
           *
           * 名前を固定しているのは size-limit から名指しするため。「中身が遅延チャンクに
           * 載っている」ことが M1.5 の完了条件（06.roadmap.md §5.3）なので、
           * 予算として監視できる形にしておく。
           */
          const isMenu = /[\\/]src[\\/]features[\\/]menu[\\/]/.test(chunk.facadeModuleId ?? '');
          return isMenu ? 'assets/menu-[hash].js' : 'assets/[name]-[hash].js';
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
