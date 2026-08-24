import type { StorybookConfig } from '@storybook/svelte-vite';

/**
 * Storybook の設定（ADR-0007）。
 *
 * # 何のためにあるか
 *
 * Tauri を起動せずにクロームの**全状態**を並べるため。通知バーの 3 段階も、
 * 履歴が空の Welcome も、実アプリでは特定の失敗を再現しないと見られない。
 *
 * # クリティカルパスへの影響はゼロ
 *
 * すべて devDependency で、`vite build` の入力に一切入らない。
 * ただし**依存を増やさない基準（04.tech-stack.md §1）は開発ツールにも効く**ので、
 * アドオンは足す前に「これが無いと何が確認できないか」を言えることを条件にする。
 */
const config: StorybookConfig = {
  stories: ['../src/**/*.stories.svelte'],

  // 既定で付いてくるアドオン（docs / onboarding など）は入れていない。
  // 見たいのはコンポーネントの状態であって、ドキュメントサイトではない。
  addons: ['@storybook/addon-svelte-csf'],

  framework: {
    name: '@storybook/svelte-vite',
    options: {},
  },
};

export default config;
