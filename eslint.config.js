/**
 * ESLint の設定（ADR-0007）。
 *
 * M0〜M1 は oxlint を使っていたが、`.svelte` を読めないため M2 の頭で ESLint に一本化した。
 * **ここにある規則は、そのときの `.oxlintrc.json` を写したもの**である。
 *
 * oxlint の `categories`（correctness / suspicious / perf をまとめて error にする仕組み）は
 * ESLint に無いので、各プラグインの recommended を土台にして、
 * 明示していたルールを個別に足し、**当時有効でなかったものを落とす**形にしてある。
 */
import js from '@eslint/js';
import prettier from 'eslint-config-prettier/flat';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import { importX } from 'eslint-plugin-import-x';
import promise from 'eslint-plugin-promise';
import svelte from 'eslint-plugin-svelte';
import unicorn from 'eslint-plugin-unicorn';
import globals from 'globals';
import svelteParser from 'svelte-eslint-parser';
import tseslint from 'typescript-eslint';

/** Rust 側の initialization_script が注入するグローバルの命名規約。 */
const INJECTED_GLOBALS = ['__MARXDOWN_BOOTSTRAP__', '__MARXDOWN_T4__', '__TAURI_INTERNALS__'];

/**
 * `unicorn.configs.recommended` のうち、**移行時点の既存コードが違反していたもの**。
 *
 * oxlint 時代はカテゴリで絞っていたため、unicorn の style 寄りのルールは有効でなかった。
 * ここで全部を有効にすると移行と無関係な差分が数百行出て、
 * 「Svelte 化で何が変わったか」が読めなくなる。
 *
 * **現状維持のためのスナップショットであって、恒久的な否定ではない。**
 * 直したくなったらこの配列から外して直せばよい。
 */
const UNICORN_NOT_ENFORCED_BEFORE = [
  'catch-error-name',
  'consistent-boolean-name',
  'consistent-class-member-order',
  'consistent-existence-index-check',
  'consistent-function-scoping',
  'dom-node-dataset',
  'import-style',
  'max-nested-calls',
  'name-replacements',
  'no-array-callback-reference',
  'no-break-in-nested-loop',
  'no-computed-property-existence-check',
  'no-declarations-before-early-exit',
  'no-immediate-mutation',
  'no-return-array-push',
  'no-top-level-assignment-in-function',
  'no-top-level-side-effects',
  'no-unnecessary-global-this',
  'no-unreadable-for-of-expression',
  'no-unsafe-string-replacement',
  'no-useless-undefined',
  'numeric-separators-style',
  'prefer-code-point',
  'prefer-global-number-constants',
  'prefer-includes-over-repeated-comparisons',
  'prefer-keyboard-event-key',
  'prefer-object-iterable-methods',
  'prefer-promise-with-resolvers',
  'prefer-scoped-selector',
  'prefer-simple-condition-first',
  'prefer-single-call',
  'prefer-spread',
  'prefer-string-raw',
  'prefer-string-replace-all',
  'relative-url-style',
  'require-array-sort-compare',
  'require-css-escape',
  'single-line-block-comment-style',
  'switch-case-braces',
];

/** プロジェクト共通のルール。`.ts` と `.svelte` の両方に効かせる。 */
const rules = {
  eqeqeq: 'error',
  'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
  'no-underscore-dangle': ['error', { allow: INJECTED_GLOBALS }],
  'no-await-in-loop': 'error',

  // 全角スペースは**正規表現の中**で意図的に使っている
  // （`text-stats.ts` の CJK 判定、`pipeline.ts` のスラグ化）。
  'no-irregular-whitespace': ['error', { skipRegExps: true }],

  '@typescript-eslint/consistent-type-imports': 'error',
  '@typescript-eslint/no-explicit-any': 'error',
  // 先頭 `_` は「使わないことが意図である」印。Platform 層の空実装で使っている。
  '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],

  'unicorn/filename-case': ['error', { cases: { kebabCase: true, pascalCase: true } }],
  // Worker の postMessage に targetOrigin は存在しない（window.postMessage 用のルール）
  'unicorn/require-post-message-target-origin': 'off',
  'unicorn/prevent-abbreviations': 'off',
  'unicorn/no-null': 'off',
  'unicorn/prefer-global-this': 'off',
  'unicorn/prefer-query-selector': 'off',
  ...Object.fromEntries(UNICORN_NOT_ENFORCED_BEFORE.map((r) => [`unicorn/${r}`, 'off'])),

  'import-x/no-cycle': 'error',
  'import-x/no-unassigned-import': 'error',
  // DOMPurify の default export に同名の named export がある（`sanitize.ts`）。
  'import-x/no-named-as-default': 'off',

  // `new Promise((ok, ng) => ...)` を許す。計測スクリプトで使っている。
  'promise/param-names': 'off',
};

export default tseslint.config(
  {
    // **`**/` を付けること。** 平坦なパターンはリポジトリ直下にしか効かず、
    // `.claude/worktrees/*/dist` のようなネストしたビルド成果物を舐めに行く
    // （lint が数分かかるようになる）。
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/storybook-static/**',
      'src-tauri/target/**',
      'bench/fixtures/**',
      '.claude/**',
    ],
  },

  js.configs.recommended,
  tseslint.configs.recommended,
  unicorn.configs.recommended,
  promise.configs['flat/recommended'],
  importX.flatConfigs.recommended,
  importX.flatConfigs.typescript,
  svelte.configs.recommended,

  {
    languageOptions: {
      globals: { ...globals.browser },
    },
    settings: {
      // `@/*` は tsconfig の `paths` にしかない。TypeScript の解決器を噛ませないと
      // import-x が全滅する（`no-cycle` も `no-unresolved` も動かない）。
      'import-x/resolver-next': [
        createTypeScriptImportResolver({
          project: ['./tsconfig.json', './tsconfig.node.json'],
          // 2 つ指定していることへの警告。分割は意図的（tsconfig.json のコメント参照）。
          noWarnOnMultipleProjects: true,
        }),
      ],
    },
    rules,
  },

  {
    // `.svelte` は専用パーサ。`<script lang="ts">` の中身は TypeScript として読む。
    files: ['**/*.svelte', '**/*.svelte.ts'],
    languageOptions: {
      parser: svelteParser,
      parserOptions: { parser: tseslint.parser },
    },
    rules: {
      // コンポーネントは PascalCase、ストア（`*.svelte.ts`）は kebab-case。
      // 拡張子が 2 段になるとルール側が `store.svelte` を 1 語と見なせないので緩める。
      'unicorn/filename-case': 'off',
    },
  },

  {
    files: ['scripts/**', '*.config.ts', '*.config.js', 'vitest.config.ts', 'vite.config.ts'],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      'no-console': 'off',
      // 計測スクリプトは「1 回ずつ順番に実行する」ことが要件そのもの。
      // 並列化すると計測値が壊れる。
      'no-await-in-loop': 'off',
      'import-x/no-unassigned-import': 'off',
    },
  },

  {
    files: ['src/spike/**', 'bench/**'],
    rules: { 'no-console': 'off' },
  },

  {
    // CSS の副作用インポートと、テストのセットアップは代入しようがない
    files: ['src/main.ts', 'tests/setup.ts', '.storybook/**'],
    rules: { 'import-x/no-unassigned-import': 'off' },
  },

  {
    // `tseslint.configs` / `tseslint.parser` は default export のメンバーで、
    // 同名の named export も持つ。この設定ファイルでは default 経由が正しい。
    files: ['eslint.config.js'],
    rules: { 'import-x/no-named-as-default-member': 'off' },
  },

  {
    files: ['tests/**', '**/*.test.ts', '**/*.bench.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },

  // 整形は Prettier の担当。競合するルールをすべて落とす（**必ず最後**）。
  prettier,
);
