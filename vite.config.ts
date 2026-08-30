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
          if (isMenu) return 'assets/menu-[hash].js';

          /*
           * 設定 UI（M1.5 Phase 4）。menu と同じく**名前付けだけ**。
           *
           * `src/features/settings/` には `main` 側のモジュール
           * （`store.svelte.ts` / `appearance.ts` / `open-settings.ts`）も同居している。
           * ここで名前が付くのは動的 import の入口（`panel.ts`）から始まるチャンクだけで、
           * `main` が静的に import しているものは `main` に残る。
           * `manualChunks` で寄せると、その境界が壊れる（menu で実測済み）。
           */
          const isSettings = /[\\/]src[\\/]features[\\/]settings[\\/]/.test(chunk.facadeModuleId ?? '');
          if (isSettings) return 'assets/settings-[hash].js';

          /*
           * 見出しへジャンプするパレット（M1.5 Phase 6）。menu / settings と同じく
           * **名前付けだけ**。`src/features/outline/` にはアウトライン本体
           * （`Outline.svelte` / `follow.ts` / `jump.ts`）も同居していて、そちらは
           * ペインの中身＝クロームなので `main` に残る。ここで名前が付くのは
           * 動的 import の入口（`jump-palette.ts`）から始まるチャンクだけ。
           */
          const isOutlineJump = /[\\/]src[\\/]features[\\/]outline[\\/]/.test(chunk.facadeModuleId ?? '');
          if (isOutlineJump) return 'assets/outline-[hash].js';

          /*
           * エディタ（M2 Phase 1）。menu / settings / outline と同じく**名前付けだけ**。
           *
           * 下の `manualChunks` が `@codemirror/*` を `editor` へ寄せているが、
           * それは**依存側**の話で、こちらは `features/editor/` から始まる
           * 動的 import の入口に名前を付けている。両方が `editor-*.js` に
           * 落ちることで、size-limit が 1 つの予算として指せる。
           *
           * `src/features/editor/open-editor.ts` は `main` から静的に import
           * されているので `main` に残る（動的 import の一行だけを持つ入口）。
           */
          const isEditor = /[\\/]src[\\/]features[\\/]editor[\\/]/.test(chunk.facadeModuleId ?? '');
          if (isEditor) return 'assets/editor-[hash].js';

          /*
           * 共有チャンク（**facade を持たない** = 動的 import の入口ではない）。
           *
           * 遅延チャンクの枚数がある数を超えると、rolldown は `main` と遅延チャンクの
           * 両方から参照されるモジュール（Svelte ランタイム / `i18n/ja.ts` / ストア）を
           * 別のチャンクへ切り出す。Phase 6 で `outline` が増えて、その閾値を越えた。
           *
           * **切り出されても `main` が静的に import するので、起動時に必ず読まれる。**
           * つまりこれはクリティカルパスの一部であり、予算の外に出してはいけない。
           * 名前は切り出し元のモジュール（`ja` など）から付くのでリファクタのたびに変わる。
           * size-limit から名指しできるよう、ここで固定する。
           *
           * 遅延チャンク同士だけが共有するチャンクもここに落ちる。そちらは起動時に
           * 読まれないので予算に対して**過大評価**になるが、取りこぼすより安全な側に倒す。
           */
          //
          // `manualChunks` で名前を付けたもの（`editor`）は facade を持たないが、
          // **意図して分けた遅延チャンク**なのでここに落としてはいけない。
          const hasFacade = chunk.facadeModuleId !== null && chunk.facadeModuleId !== undefined;
          if (!hasFacade && chunk.name !== 'editor') {
            return 'assets/shared-[hash].js';
          }

          return 'assets/[name]-[hash].js';
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
