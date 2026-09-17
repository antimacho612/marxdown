import { fileURLToPath, URL } from 'node:url';

import { svelte } from '@sveltejs/vite-plugin-svelte';
import { visualizer } from 'rollup-plugin-visualizer';
import { defineConfig, type Plugin } from 'vite';

const host = process.env.TAURI_DEV_HOST;

/**
 * Mermaid だけが引くパッケージ（F-VIEW-12 / `chunkFileNames` の `isVendorOnly` 判定）。
 *
 * ここに無いパッケージが Mermaid の依存に増えても、そのぶんが `shared-*` に落ちて
 * critical path の実測が跳ねるだけであり、起動時に読み込まれるものは変わらない。
 * **数字が跳ねたらこの一覧を疑うこと。**
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
 * 対象は WebView2 Evergreen と WKWebView だけなので（`tsconfig.json` の `target` と同じ理由）、
 * 残り 2 形式は表示を何も変えないままインストーラを 1MB 近く太らせる。
 *
 * 一致しなかった場合は 3 形式がそのまま同梱される。
 * KaTeX 側の書き方が変わっても、フォントが引けなくなる側には倒れない。
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

/**
 * チャンク境界は 02.architecture.md §5.3 の表がそのまま仕様になっている。
 * `main` + `shared` + `pipeline` がクリティカルパスであり、size-limit の監視対象。
 */
export default defineConfig(({ mode }) => ({
  plugins: [
    svelte(),
    katexWoff2Only(),
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
     * CSP の `font-src` は `'self'` だけなので（02.architecture/09-security.md §1 Layer 1）、
     * 埋め込まれたフォントは実行時に弾かれ、その face だけ描画に使われない。
     * KaTeX の `KaTeX_Size3-Regular.woff2` が実際にこれに該当した。
     *
     * CSP に `data:` を足す側では直さない。
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
           * 設定の見本（OQ-38）。`settings` の予算から外へ出すために、名前を分ける。
           *
           * 見本を描くのは「プレビュー」「エディター」のカテゴリだけで、既定のカテゴリ
           * （外観）には無い。つまり `Ctrl+,` を押しただけではロードされず、
           * `settings`（「設定を開いたときに読むもの」の予算）が数える対象ではない。
           * `settings-` で始まる名前を付けると `dist/assets/settings-*.js` の
           * glob に入ってしまうため、接頭辞ごと分ける。**下の `isSettings` より前に置くこと。**
           */
          const isSettingsSample = /[\\/]src[\\/]features[\\/]settings[\\/]lazy[\\/]samples[\\/]/.test(
            chunk.facadeModuleId ?? '',
          );
          if (isSettingsSample) return 'assets/sample-[hash].js';

          /*
           * エディターの配色 50 枚（ADR-0014）。**入口を持つが、判定は palette と同じ形にしてある。**
           *
           * `features/editor/lazy/palette.ts` と設定 UI の `ThemeField.svelte` の 2 か所から
           * 動的 import されるため、Rollup は共有チャンクとして切り出す。そのチャンクが
           * `facadeModuleId` を持つとは限らない。名前が付かないと下の `shared-*` に落ち、
           * **起動時に読み込まれないのに critical path が数えてしまう**（palette で実測済みの事故と同じ形）。
           *
           * `isEditor` / `isSettings` より前に置くこと。どちらの判定も `facadeModuleId` の
           * パスを見るだけなので、配色のチャンクが先にどちらかへ吸われることはないが、
           * **`features/theme/` を `features/editor/lazy/` の下へ移すと editor チャンク
           * （予算の対象外 / 850KB）に紛れて、50 枚ぶんの実サイズが見えなくなる。**
           */
          const modules = chunk.moduleIds ?? [];
          const isThemeOnly =
            modules.length > 0 && modules.every((id) => /[\\/]src[\\/]features[\\/]theme[\\/]lazy[\\/]/.test(id));
          if (isThemeOnly) return 'assets/theme-[hash].js';

          /*
           * 設定 UI（M1.5 Phase 4）。menu と同じく**名前付けだけ**。
           *
           * `src/features/settings/` には `main` 側のモジュール
           * （`store.svelte.ts` / `appearance.ts` / `format.ts` / `open-settings.ts`）も同居している。
           * ここで名前が付くのは動的 import の入口（`lazy/panel.ts`）から
           * 始まるチャンクだけで、`main` が静的に import しているものは `main` に残る。
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
           * パレットの器（M3 Phase 4）。**入口を持たないチャンクなので、判定が他と違う。**
           *
           * コマンドパレットと見出しジャンプの 2 つが同じ器を使うため、Vite は共有部分を
           * 独立したチャンクへ切り出す。そのチャンクには入口が無く `facadeModuleId` も無い。
           * 名前が付かないと `shared-*` に落ち、**size-limit の critical path が拾ってしまう**
           * （実測 +2.72KB / 2026-09-08）。起動時には読み込まれないのに予算を食う形になる。
           *
           * そこで、含まれるモジュールが全部 `features/palette/lazy/` のものであるときだけ名前を付ける。
           * `manualChunks` で寄せるのとは違い、**分割そのものには手を出していない**（menu と同じ方針）。
           */
          const isPaletteOnly =
            modules.length > 0 && modules.every((id) => /[\\/]src[\\/]features[\\/]palette[\\/]lazy[\\/]/.test(id));
          if (isPaletteOnly) return 'assets/palette-[hash].js';

          /*
           * ステータスバーのポップアップメニュー（M2 Phase 7）。他と同じく**名前付けだけ**。
           *
           * `src/features/status/lazy/` に置いてあるのは**押されるまで要らないもの**だけで、
           * `main` 側は `app/StatusMenuButton.svelte`（ボタン 1 つ）しか持たない。
           * feature 直下の `props.ts` と `index.ts` は型だけなので、評価されるものは残らない。
           */
          const isStatusMenu = /[\\/]src[\\/]features[\\/]status[\\/]/.test(chunk.facadeModuleId ?? '');
          if (isStatusMenu) return 'assets/status-[hash].js';

          /*
           * エディター（M2 Phase 1）。menu / settings / outline と同じく**名前付けだけ**。
           *
           * `src/features/editor/open-editor.ts` は `main` から静的に import
           * されているので `main` に残る（動的 import の一行だけを持つ入口）。
           */
          const isEditor = /[\\/]src[\\/]features[\\/]editor[\\/]/.test(chunk.facadeModuleId ?? '');
          if (isEditor) return 'assets/editor-[hash].js';

          /*
           * Monaco の実体（ADR-0009）。**ここも名前付けだけである。**
           *
           * 以前は `manualChunks` で 1 つの `editor` チャンクへ寄せていたが、
           * **それが起動を遅くしていた。** まとめた結果、Vite が注入する動的 import の
           * ヘルパ（`__vitePreload`）がその巨大なチャンクに同居し、`main` がヘルパを
           * **静的に** import することになる。754KB が `index.html` の `modulepreload` に出て、
           * 起動時の評価対象へ入っていた（M3 Phase 8 で実測 / measurements/03-cold-start.md）。
           *
           * 分割は Rollup に任せ、Monaco だけで構成されたチャンクに名前を付ける。
           * size-limit が 1 つの予算として指せる状態は保たれる。
           */
          const isMonacoOnly = modules.length > 0 && modules.every((id) => id.includes('node_modules/monaco-editor'));
          if (isMonacoOnly) return 'assets/editor-[hash].js';

          /*
           * 入力レスポンスの計測（M2 Phase 6 / `--bench-input`）。他と同じく**名前付けだけ**。
           *
           * 名前を固定しているのは size-limit から名指しするためで、
           * **「計測の道具がクリティカルパスに載っていないこと」を予算として見張る**。
           * 比較のためだけの経路が本命の予算を食った件
           * （measurements/07-bundle.md §4）と同じ事故を繰り返さないための番人。
           */
          const isBench = /[\\/]src[\\/]features[\\/]bench[\\/]/.test(chunk.facadeModuleId ?? '');
          if (isBench) return 'assets/bench-[hash].js';

          /*
           * Markdown パイプライン（markdown-it 一式）。**名前付けだけ。**
           *
           * かつては `md-worker` として Worker 側のエントリだった。ADR-0010 で
           * メインスレッドへ戻したが、**起動直後に必ず要るのでクリティカルパスのまま**である。
           * 遅延 import にしてあるのは `main` の予算計測を実態に合わせるためで
           * （`src/markdown/parser.ts`）、size-limit はこの名前で予算に数え入れている。
           */
          const isPipeline = /[\\/]src[\\/]markdown[\\/]pipeline\.ts$/.test(chunk.facadeModuleId ?? '');
          if (isPipeline) return 'assets/pipeline-[hash].js';

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
          /*
           * KaTeX の実体（F-VIEW-13）。Monaco と同じ理由で**名前付けだけ**である。
           *
           * `preview/lazy/math.ts` から動的 import しているが、74.2KB あるため
           * rolldown が KaTeX だけのチャンクへ切り出すことがある。そのチャンクは
           * facade を持たないので、名前を付けないと下の `shared-*` に落ち、
           * **size-limit の critical path が数えてしまう**（palette で実測済みの事故と同じ形）。
           */
          const isKatexOnly = modules.length > 0 && modules.every((id) => id.includes('node_modules/katex'));
          if (isKatexOnly) return 'assets/math-[hash].js';

          /*
           * Mermaid の依存グラフ（F-VIEW-12）。**ここも名前付けだけである。**
           *
           * Mermaid は cytoscape / d3 / dagre / roughjs など 100 枚近いチャンクに割れ、
           * そのほとんどが facade を持たない。名前を付けないと全部が下の `shared-*` に落ち、
           * **size-limit の critical path が 480KB ぶん多く数える**（実測 127.7 → 608.5KB）。
           * 起動時に実際に読み込まれるものは何も変わっていない（`index.html` の modulepreload は 12 枚のまま）。
           *
           * 判定は「node_modules だけで構成され、かつ Mermaid しか引かないパッケージを含む」。
           * `dompurify` と `katex` は Mermaid も引くがこちらも直接使うため、
           * 「アプリのパッケージを含まない」という条件では拾えない。
           * それらが同居したチャンクは遅延側にしか現れず（`index.html` に載らない）、
           * `main` は自分のぶんを別のチャンクで持っている。
           */
          const isVendorOnly = modules.length > 0 && modules.every((id) => id.includes('node_modules'));
          if (
            isVendorOnly &&
            modules.some((id) => MERMAID_PACKAGES.some((name) => id.includes(`node_modules/${name}/`)))
          ) {
            return 'assets/mermaid-[hash].js';
          }

          const hasFacade = chunk.facadeModuleId !== null && chunk.facadeModuleId !== undefined;
          if (!hasFacade && chunk.name !== 'editor') {
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
