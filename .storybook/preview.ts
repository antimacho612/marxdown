import type { Preview } from '@storybook/svelte-vite';

/**
 * アプリ本体と**同じ CSS** を読む。
 *
 * Storybook 用にトークンを書き写すと、そこが二重管理になって必ずずれる。
 * `shell.css` まで読んでいるのは、クロームの grid（`grid-area`）が
 * そこにあるコンテナ側の定義に依存しているため。
 * `preview.css` は「カスタム CSS」の story（F-CONF-07 / 02.architecture.md §10.3）が
 * **既定の本文スタイルとの勝ち負け**を見せるために要る。セレクタは
 * `.mx-preview` 配下に閉じているので、他の story には及ばない。
 */
import '../src/styles/tokens.css';
import '../src/styles/reset.css';
import '../src/styles/shell.css';
import '../src/styles/preview/preview.css';

import { registerAppCommands } from '../src/app/commands';

/**
 * コマンドを登録する（`src/app/commands.ts`）。
 *
 * メニューは `CommandId` しか持たず、実体はレジストリから引く。
 * 登録しないと**ハンバーガーメニューの項目が 1 つも出ない**ので、
 * 実アプリの `bootstrap` にあたる仕事をここで 1 回だけ済ませる。
 *
 * キーは割り当てない（`installCommands` ではなくこちらを呼ぶ理由）。
 * Storybook で `Ctrl+F` を奪われると、story を探せなくなる。
 */
registerAppCommands();

const preview: Preview = {
  parameters: {
    // 背景はテーマトークンが決める。Storybook 側の背景切り替えとは二重になるので使わない。
    backgrounds: { disable: true },
    controls: { matchers: { color: /(background|color)$/i } },
  },

  /**
   * ダークテーマの切り替え（ADR-0005）。
   *
   * アプリでは Rust 側が起動前に `<html data-theme>` を打つ。ここでは
   * ツールバーから同じ属性を切り替えて、両方の見え方を 1 つの画面で確認できるようにする。
   */
  globalTypes: {
    theme: {
      description: 'テーマ',
      toolbar: {
        icon: 'circlehollow',
        items: [
          { value: 'light', title: 'Light' },
          { value: 'dark', title: 'Dark' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { theme: 'light' },

  decorators: [
    (story, context) => {
      document.documentElement.dataset['theme'] = String(context.globals['theme']);
      return story();
    },
  ],
};

export default preview;
