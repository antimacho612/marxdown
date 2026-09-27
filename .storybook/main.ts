import type { StorybookConfig } from '@storybook/svelte-vite';

/**
 * Storybook の設定。
 *
 * Tauri を起動せずにクロームの全状態を並べるためにある。
 * 通知バーの 3 段階も、履歴が空の Welcome も、実アプリでは特定の失敗を再現しないと見られない。
 *
 * クリティカルパスへの影響は無く、すべて devDependency として `vite build` の入力に一切入らない。
 * ただし依存を増やさない基準は開発ツールにも適用されるため、アドオンは追加する前に「これが無いと何が確認できないか」を説明できることを条件にする。
 */
const config: StorybookConfig = {
  stories: ['../src/**/*.stories.svelte'],

  // 既定で付いてくるアドオン（docs / onboarding など）は入れていない。
  // 確認したいのはコンポーネントの状態であって、ドキュメントサイトではない。
  addons: ['@storybook/addon-svelte-csf'],

  framework: {
    name: '@storybook/svelte-vite',
    options: {},
  },
};

export default config;
