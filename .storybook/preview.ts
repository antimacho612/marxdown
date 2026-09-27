import type { Preview } from '@storybook/svelte-vite';

/**
 * アプリ本体と同じ CSS を読む。
 *
 * Storybook 用にトークンを書き写すと、そこが二重管理になって必ずずれる。
 * `shell.css` まで読んでいるのは、クロームの grid（`grid-area`）がそこにあるコンテナ側の定義に依存しているため。
 * `preview/preview.css` は本文の既定スタイルであり、本文を含む story がこれを必要とする。
 * セレクタは `.mx-preview` 配下に閉じているので、他の story には及ばない。
 * 配色（ADR-0014）は CSS ではなく `theme` チャンクが注入するため、ここでは読まない。
 */
import '../src/styles/tokens.css';
import '../src/styles/reset.css';
import '../src/styles/shell.css';
import '../src/styles/preview/preview.css';

import { registerAppCommands } from '../src/app/commands';
import { loadMessages } from '../src/i18n';
import { loadExplorerMessages } from '../src/i18n/explorer';
import { loadMarpMessages } from '../src/i18n/marp';
import { loadSettingsMessages } from '../src/i18n/settings';
import { loadUpdateMessages } from '../src/i18n/update';

/**
 * コマンドを登録する（`src/app/commands.ts`）。
 *
 * メニューは `CommandId` しか持たず、実体はレジストリから引く。
 * 登録しないとハンバーガーメニューの項目が 1 つも出ないため、実アプリの `bootstrap` にあたる処理をここで 1 回だけ行う。
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
   * アプリでは Rust 側が起動前に `<html data-theme>` を設定する。
   * ここではツールバーから同じ属性を切り替えて、両方の見え方を 1 つの画面で確認できるようにする。
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

  // 実アプリでは `main.ts` と各遅延チャンクの入口が文言を読み込む。story は遅延チャンクの部品を直接描くため、すべて先に読み込む。
  loaders: [
    async () => {
      await Promise.all([
        loadMessages(),
        loadExplorerMessages(),
        loadMarpMessages(),
        loadSettingsMessages(),
        loadUpdateMessages(),
      ]);
      return {};
    },
  ],

  decorators: [
    (story, context) => {
      document.documentElement.dataset['theme'] = String(context.globals['theme']);
      return story();
    },
  ],
};

export default preview;
