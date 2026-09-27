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

/** 公開用 `index.ts` を通した参照だけを許す feature の一覧。 */
const FEATURE_BARREL_ENFORCED = [
  'document',
  'editor',
  'history',
  'menu',
  'mode',
  'outline',
  'panes',
  'preview',
  'settings',
  'status',
  'theme',
  'view',
  'workspace',
];

/** プロジェクト共通のルール。`.ts` と `.svelte` の両方に効かせる。 */
const rules = {
  eqeqeq: 'error',
  'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
  'no-underscore-dangle': ['error', { allow: INJECTED_GLOBALS }],
  'no-await-in-loop': 'error',

  // 全角スペースは正規表現の中で意図的に使っている（例: `text-stats.ts` の CJK 判定、`pipeline.ts` のスラグ化）。
  'no-irregular-whitespace': ['error', { skipRegExps: true }],

  '@typescript-eslint/consistent-type-imports': 'error',
  '@typescript-eslint/no-explicit-any': 'error',
  '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],

  'unicorn/filename-case': ['error', { cases: { kebabCase: true, pascalCase: true } }],
  'unicorn/prevent-abbreviations': 'off',
  'unicorn/no-null': 'off',
  'unicorn/prefer-global-this': 'off',
  'unicorn/prefer-query-selector': 'off',
  ...Object.fromEntries(UNICORN_NOT_ENFORCED_BEFORE.map((r) => [`unicorn/${r}`, 'off'])),

  'no-restricted-imports': [
    'error',
    {
      patterns: FEATURE_BARREL_ENFORCED.map((feature) => ({
        // gitignore と同じ解釈なので、`lazy/` 自身を先に除外から戻さないと配下に届かない。
        group: [`@/features/${feature}/*`, `!@/features/${feature}/lazy`, `!@/features/${feature}/lazy/**`],
        message: `feature の外からは '@/features/${feature}' を経由すること（遅延チャンクの入口だけは 'lazy/' 直下を名指しする）。`,
      })),
    },
  ],

  'import-x/no-cycle': 'error',
  'import-x/no-unassigned-import': 'error',
  // DOMPurify の default export に同名の named export があるため（`sanitize.ts`）。
  'import-x/no-named-as-default': 'off',

  // 計測スクリプトで使っているため
  'promise/param-names': 'off',
};

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/storybook-static/**',
      'src-tauri/target/**',
      'bench/fixtures/**',
      '.claude/**',
      'design/**',
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
      'import-x/resolver-next': [
        createTypeScriptImportResolver({
          project: ['./tsconfig.json', './tsconfig.node.json'],
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
      // 計測スクリプトは 1 回ずつ順番に実行しないと正式な計測にならないため。
      'no-await-in-loop': 'off',
      'import-x/no-unassigned-import': 'off',
    },
  },

  {
    files: ['bench/**'],
    rules: { 'no-console': 'off' },
  },

  {
    files: [
      // CSS の副作用インポートのため
      'src/main.ts',
      // テストのセットアップのため
      'tests/setup.ts',
      // Monaco から何を取るかの一覧そのもので、contrib の登録は副作用インポート以外の書き方が無い。
      'src/features/editor/lazy/monaco.ts',
      // KaTeX の CSS
      'src/features/preview/lazy/math.ts',
      'src/features/preview/lazy/mermaid.ts',
      '.storybook/**',
    ],
    rules: { 'import-x/no-unassigned-import': 'off' },
  },

  {
    files: ['tests/setup.ts'],
    rules: { 'unicorn/no-global-object-property-assignment': 'off' },
  },

  {
    files: ['eslint.config.js'],
    rules: { 'import-x/no-named-as-default-member': 'off' },
  },

  {
    files: ['tests/**', '**/*.test.ts', '**/*.bench.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },

  {
    // `browser` / `$` / `expect` はランナーが注入するので、import しないまま使うのが正しい（型は tsconfig.e2e.json が入れる）。
    files: ['e2e/**'],
    languageOptions: {
      globals: { ...globals.node, ...globals.mocha, browser: 'readonly', $: 'readonly', $$: 'readonly' },
    },
    rules: {
      'no-console': 'off',
      'no-await-in-loop': 'off',
      // ドライバのプロセス起動と対象ファイルの入れ替えは、素直に副作用として書く。
      'unicorn/no-process-exit': 'off',
      // `browser.keys()` は WebdriverIO のキー送信 API で、返るのは Promise。
      // ルールが `Array.prototype.keys()` と取り違える（await していても出る）。
      'unicorn/no-unused-array-method-return': 'off',
    },
  },

  prettier,
);
