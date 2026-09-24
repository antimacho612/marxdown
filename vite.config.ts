import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath, URL } from 'node:url';

import { svelte } from '@sveltejs/vite-plugin-svelte';
import { visualizer } from 'rollup-plugin-visualizer';
import { defineConfig, type Plugin } from 'vite';

const host = process.env.TAURI_DEV_HOST;

/**
 * Mermaid だけが引くパッケージ（F-VIEW-12 / `chunkFileNames` の `isVendorOnly` 判定）。
 *
 * ここに無いパッケージが Mermaid の依存に増えても、その分が `shared-*` として扱われて critical path の計測値が増えるだけであり、起動時に読み込まれるものは変わらない。
 * 数値が急に増えたらこの一覧を確認すること。
 *
 * `dompurify` と `katex` は Mermaid も引くが、こちらも直接使うため入れていない。
 */
const MERMAID_PACKAGES = [
  '@braintree',
  '@iconify',
  '@mermaid-js',
  '@upsetjs',
  'cytoscape',
  'cytoscape-cose-bilkent',
  'cytoscape-fcose',
  'd3',
  'dagre-d3-es',
  'dayjs',
  'delaunator',
  'es-toolkit',
  'fastdom',
  'internmap',
  'khroma',
  'marked',
  'mermaid',
  'path-data-parser',
  'points-on-curve',
  'points-on-path',
  'robust-predicates',
  'roughjs',
  'stylis',
  'ts-dedent',
  'uuid',
];

/**
 * KaTeX のフォント参照を woff2 だけに削る（F-VIEW-13）。
 *
 * `katex.min.css` の `@font-face` は woff2 / woff / ttf の 3 形式を並べる。
 * 対象は WebView2 Evergreen と WKWebView だけなので（`tsconfig.json` の `target` と同じ理由）、残り 2 形式は表示を何も変えないままインストーラを 1MB 近く大きくする。
 *
 * 一致しなかった場合は 3 形式がそのまま同梱される。
 * KaTeX 側の書き方が変わっても、フォントを読み込めなくなることはない。
 */
function katexWoff2Only(): Plugin {
  return {
    name: 'marxdown:katex-woff2-only',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('katex') || !/\.css(?:\?|$)/.test(id)) return null;
      return {
        code: code.replaceAll(/,url\(fonts\/[^)]+\.(?:woff|ttf)\)\s*format\("(?:woff|truetype)"\)/g, ''),
        map: null,
      };
    },
  };
}

/** バンドルに入った npm パッケージの一覧の書き出し先（`scripts/gen-third-party-notices.mjs` が読む）。 */
const BUNDLED_PACKAGES_FILE = fileURLToPath(new URL('./node_modules/.tmp/bundled-packages.json', import.meta.url));

/**
 * バンドルに入った npm パッケージのディレクトリを記録する（第三者ライセンスの一覧 / docs/06.roadmap/m6-ship.md Phase 4.5）。
 *
 * package.json の `dependencies` からは求められない。
 * Svelte のランタイムは devDependencies にありながらバンドルに入る。
 * 書き出し先は `dist` の外にする。`dist` は exe に埋め込まれる。
 */
function recordBundledPackages(): Plugin {
  const dirs = new Set<string>();
  return {
    name: 'marxdown:record-bundled-packages',
    apply: 'build',
    generateBundle(_options, bundle) {
      for (const output of Object.values(bundle)) {
        if (output.type !== 'chunk') continue;
        for (const id of output.moduleIds) {
          const dir = packageDirOf(id);
          if (dir) dirs.add(dir);
        }
      }
    },
    closeBundle() {
      mkdirSync(dirname(BUNDLED_PACKAGES_FILE), { recursive: true });
      writeFileSync(BUNDLED_PACKAGES_FILE, JSON.stringify([...dirs].toSorted(), null, 2));
    },
  };
}

/** モジュール ID から、それを含む npm パッケージのディレクトリを返す。node_modules の外なら `null`。 */
function packageDirOf(id: string): string | null {
  const path = id.replace(/^\0/, '').replace(/\?.*$/, '').replaceAll('\\', '/');
  const marker = '/node_modules/';
  const at = path.lastIndexOf(marker);
  if (at < 0) return null;
  const rest = path.slice(at + marker.length).split('/');
  const name = rest[0]?.startsWith('@') ? `${rest[0]}/${rest[1]}` : rest[0];
  return name ? path.slice(0, at + marker.length) + name : null;
}

/**
 * チャンク境界は 02.architecture/05-startup-sequence.md §4 の表がそのまま仕様になっている。
 * `main` + `shared` + `pipeline` + アプリの CSS がクリティカルパスであり、size-limit の検証対象である。
 */
export default defineConfig(({ mode }) => ({
  plugins: [
    svelte(),
    katexWoff2Only(),
    recordBundledPackages(),
    ...(mode === 'analyze'
      ? [visualizer({ filename: 'dist/stats.html', gzipSize: true, brotliSize: true, open: false })]
      : []),
  ],

  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },

  build: {
    // WebView2 Evergreen / WKWebView のみを対象にするため
    target: 'esnext',
    /*
     * フォントは必ずファイルとして出す。
     *
     * 既定では小さいアセットが `data:` URI として CSS に埋め込まれる。
     * CSP の `font-src` は `'self'` だけなので、埋め込まれたフォントは実行時に拒否され、その face だけ描画に使われない。
     * KaTeX の `KaTeX_Size3-Regular.woff2` がこれに該当する。
     * CSP に `data:` を追加して対応することはしない。
     */
    assetsInlineLimit(filePath) {
      return /\.(?:woff2?|ttf|otf|eot)$/i.test(filePath) ? false : undefined;
    },
    sourcemap: mode !== 'production',
    reportCompressedSize: true,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/main-[hash].js',
        /**
         * highlight.js の言語定義には `hljs-` を冠する。
         *
         * 1 言語 1 チャンクという分割そのものは Vite の自動分割の結果であって、`manualChunks` でまとめてはいけない。
         * まとめると TypeScript のドキュメントを開いただけで Java や SQL の文法まで読み込まれる。
         * ここでやっているのは名前付けだけで、名前が揃っていないと size-limit からハイライト一式を 1 つの予算として指せない。
         */
        chunkFileNames(chunk) {
          // Vite が解決するのは ESM ビルド（`es/`）で、CJS の `lib/` ではない。
          const isLanguage = /highlight\.js[\\/](?:es|lib)[\\/]languages[\\/]/.test(chunk.facadeModuleId ?? '');
          if (isLanguage) return 'assets/hljs-[name]-[hash].js';

          /*
           * ハンバーガーメニューの中身。
           *
           * 分割そのものは動的 import の結果であって、ここでやっているのは名前付けだけ（hljs と同じ）。
           * `manualChunks` で 'menu' にまとめてはいけない。
           * `main` と共有しているモジュール（`open.ts` / `zoom.ts` など）まで menu チャンク側へ移動し、`main` がそれを静的 import する形になって、遅延どころか起動時に読み込まれるチャンクになる。
           * 名前を固定しているのは size-limit から名指しするため。
           */
          const isMenu = /[\\/]src[\\/]features[\\/]menu[\\/]/.test(chunk.facadeModuleId ?? '');
          if (isMenu) return 'assets/menu-[hash].js';

          /*
           * 設定の見本。`settings` の予算から外へ出すために、名前を分ける。
           *
           * 見本を描くのは「プレビュー」「エディター」のカテゴリだけで、既定のカテゴリには無い。
           * つまり `Ctrl+,` を押しただけではロードされず `settings`（「設定を開いたときに読むもの」の予算）が数える対象ではない。
           * `settings-` で始まる名前を付けると `dist/assets/settings-*.js` の glob に入ってしまうため、接頭辞ごと分ける。
           * 下の `isSettings` より前に置くこと。
           */
          const isSettingsSample = /[\\/]src[\\/]features[\\/]settings[\\/]lazy[\\/]samples[\\/]/.test(
            chunk.facadeModuleId ?? '',
          );
          if (isSettingsSample) return 'assets/sample-[hash].js';

          /*
           * 配色 50 枚（`theme` チャンク）。入口を持つが、判定は palette と同じ形にしてある。
           *
           * `features/theme/index.ts` の `loadThemeCatalog` と設定 UI の `ThemeField.svelte` の 2 か所から動的 import されるため、Rollup は共有チャンクとして切り出す。
           * そのチャンクが `facadeModuleId` を持つとは限らない。
           * 名前が付かないと下の `shared-*` として扱われ、起動時に読み込まれないのに critical path に数えられる。
           * `isEditor` / `isSettings` より前に置くこと。
           * どちらの判定も `facadeModuleId` のパスを見るだけなので、配色のチャンクが先にどちらかに含まれることはないが、`features/theme/` を `features/editor/lazy/` の下へ移すと editor チャンク（予算の対象外）に含まれて、50 枚ぶんの実サイズが見えなくなる。
           */
          const modules = chunk.moduleIds ?? [];
          const isThemeOnly =
            modules.length > 0 && modules.every((id) => /[\\/]src[\\/]features[\\/]theme[\\/]lazy[\\/]/.test(id));
          if (isThemeOnly) return 'assets/theme-[hash].js';

          /*
           * 設定 UI。menu と同じく名前付けだけ。
           *
           * `src/features/settings/` には `main` 側のモジュール（`store.svelte.ts` / `appearance.ts` / `format.ts` / `open-settings.ts`）も同居している。
           * ここで名前が付くのは動的 import の入口（`lazy/panel.ts`）から始まるチャンクだけで、`main` が静的に import しているものは `main` に残る。
           * `manualChunks` でまとめると、その境界が壊れる。
           */
          const isSettings = /[\\/]src[\\/]features[\\/]settings[\\/]/.test(chunk.facadeModuleId ?? '');
          if (isSettings) return 'assets/settings-[hash].js';

          /*
           * 見出しへジャンプするパレット。
           * menu / settings と同じく名前付けだけ。
           * `src/features/outline/` にはアウトライン本体（`Outline.svelte` / `follow.ts` / `jump.ts`）も同居していて、そちらはペインの中身＝クロームなので `main` に残る。
           * ここで名前が付くのは動的 import の入口（`jump-palette.ts`）から始まるチャンクだけ。
           */
          const isOutlineJump = /[\\/]src[\\/]features[\\/]outline[\\/]/.test(chunk.facadeModuleId ?? '');
          if (isOutlineJump) return 'assets/outline-[hash].js';

          /*
           * パレットの外枠。入口を持たないチャンクなので、判定が他と違う。
           *
           * コマンドパレット・クイックオープン・見出しジャンプが同じ外枠を使うため、Vite は共有部分を独立したチャンクへ切り出す。
           * そのチャンクには入口が無く `facadeModuleId` も無い。
           * 名前が付かないと `shared-*` として扱われ、size-limit の critical path に数えられる。
           * 起動時には読み込まれないのに予算を消費する形になる。
           *
           * そこで、含まれるモジュールがすべて `features/palette/lazy/` のものであるときだけ名前を付ける。
           * `manualChunks` でまとめるのとは違い、分割そのものには手を出していない（menu と同じ方針）。
           */
          const isPaletteOnly =
            modules.length > 0 && modules.every((id) => /[\\/]src[\\/]features[\\/]palette[\\/]lazy[\\/]/.test(id));
          if (isPaletteOnly) return 'assets/palette-[hash].js';

          /*
           * ステータスバーのポップアップメニュー。他と同じく名前付けだけ。
           *
           * `src/features/status/lazy/` に置いてあるのは押されるまで要らないものだけで、`main` 側は `app/StatusMenuButton.svelte`（ボタン 1 つ）しか持たない。
           * feature 直下の `props.ts` と `index.ts` は型だけなので、評価されるものは残らない。
           */
          const isStatusMenu = /[\\/]src[\\/]features[\\/]status[\\/]/.test(chunk.facadeModuleId ?? '');
          if (isStatusMenu) return 'assets/status-[hash].js';

          /*
           * エディター。menu / settings / outline と同じく名前付けだけ。
           *
           * `src/features/editor/open-editor.ts` は `main` から静的に import されているので `main` に残る（動的 import の一行だけを持つ入口）。
           */
          const isEditor = /[\\/]src[\\/]features[\\/]editor[\\/]/.test(chunk.facadeModuleId ?? '');
          if (isEditor) return 'assets/editor-[hash].js';

          /*
           * Monaco の実体。ここも名前付けだけである。
           *
           * `manualChunks` で 1 つのチャンクへまとめてはいけない。
           * まとめると、Vite が注入する動的 import のヘルパ（`__vitePreload`）がその巨大なチャンクに同居し、`main` がヘルパを静的に import することになる。
           * その結果、Monaco の実体が `index.html` の `modulepreload` に出て、起動時の評価対象に入る（measurements/03-cold-start.md）。
           *
           * 分割は Rollup に任せ、Monaco だけで構成されたチャンクに名前を付ける。
           * size-limit が 1 つの予算として指せる状態は保たれる。
           */
          const isMonacoOnly = modules.length > 0 && modules.every((id) => id.includes('node_modules/monaco-editor'));
          if (isMonacoOnly) return 'assets/editor-[hash].js';

          /*
           * 入力レスポンスの計測。他と同じく名前付けだけ。
           *
           * 名前を固定しているのは size-limit から名指しするためで、「計測の道具がクリティカルパスに含まれていないこと」を予算として検証する。
           */
          const isBench = /[\\/]src[\\/]features[\\/]bench[\\/]/.test(chunk.facadeModuleId ?? '');
          if (isBench) return 'assets/bench-[hash].js';

          /*
           * Markdown パイプライン（markdown-it 一式）。名前付けだけ。
           * 遅延 import にしてあるのは `main` の予算計測を実態に合わせるためで（`src/markdown/parser.ts`）、size-limit はこの名前で予算に数え入れている。
           */
          const isPipeline = /[\\/]src[\\/]markdown[\\/]pipeline\.ts$/.test(chunk.facadeModuleId ?? '');
          if (isPipeline) return 'assets/pipeline-[hash].js';

          /*
           * KaTeX の実体。Monaco と同じ理由で名前付けだけである。
           *
           * `preview/lazy/math.ts` から動的 import しているが、大きいため rolldown が KaTeX だけのチャンクへ切り出すことがある。
           * そのチャンクは facade を持たないので、名前を付けないと下の `shared-*` として扱われ、size-limit の critical path に数えられる。
           */
          const isKatexOnly = modules.length > 0 && modules.every((id) => id.includes('node_modules/katex'));
          if (isKatexOnly) return 'assets/math-[hash].js';

          /*
           * Mermaid の依存グラフ。ここも名前付けだけである。
           *
           * Mermaid は cytoscape / d3 / dagre / roughjs など 100 枚近いチャンクに分かれ、そのほとんどが facade を持たない。
           * 名前を付けないとすべてが下の `shared-*` として扱われ、size-limit の critical path が約 480KB 多く数える。
           * 起動時に実際に読み込まれるもの（`index.html` の modulepreload）は変わらない。
           *
           * 判定は「node_modules だけで構成され、かつ Mermaid しか使わないパッケージを含む」。
           * `dompurify` と `katex` は Mermaid も使うがこちらも直接使うため、「アプリのパッケージを含まない」という条件では判定できない。
           * それらが同居したチャンクは遅延側にしか現れず（`index.html` に含まれない）、`main` は自分の分を別のチャンクで持っている。
           */
          const isVendorOnly = modules.length > 0 && modules.every((id) => id.includes('node_modules'));
          if (
            isVendorOnly &&
            modules.some((id) => MERMAID_PACKAGES.some((name) => id.includes(`node_modules/${name}/`)))
          ) {
            return 'assets/mermaid-[hash].js';
          }

          /*
           * 共有チャンク（facade を持たない = 動的 import の入口ではない）。
           *
           * 遅延チャンクの枚数がある数を超えると、rolldown は `main` と遅延チャンクの両方から参照されるモジュール（Svelte ランタイム / `i18n/ja.ts` / ストア）を別のチャンクへ切り出す。
           *
           * 切り出されても `main` が静的に import するので、起動時に必ず読まれる。
           * つまりこれはクリティカルパスの一部であり、予算の外に出してはいけない。
           * 名前は切り出し元のモジュール（`ja` など）から付くのでリファクタのたびに変わる。
           * size-limit から名指しできるよう、ここで固定する。
           *
           * 遅延チャンク同士だけが共有するチャンクもここに含まれる。
           * そちらは起動時に読まれないので予算に対して過大評価になるが、見落とすより安全な側を選ぶ。
           */
          const hasFacade = chunk.facadeModuleId !== null && chunk.facadeModuleId !== undefined;
          if (!hasFacade) {
            return 'assets/shared-[hash].js';
          }

          return 'assets/[name]-[hash].js';
        },
        assetFileNames: 'assets/[name]-[hash][extname]',
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
