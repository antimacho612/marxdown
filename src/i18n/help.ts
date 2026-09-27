/**
 * ヘルプだけが使う文言（F-OS-09 / ADR-0027）。
 *
 * 使う側は遅延チャンク（`features/help/lazy/`）にあるため、`t` とは分けてある（`update.ts` と同じ理由）。
 * メニューとコマンドパレットに並ぶ項目名は `t.menu` にある。
 */
import { lazyMessages } from './index';
import type { HelpMessages } from './types';

const help = lazyMessages<HelpMessages>({
  ja: async () => {
    const { jaHelp } = await import('./ja/help');
    return jaHelp;
  },
});

/** 表示言語のヘルプの文言。`loadHelpMessages()` が完了するまで空である。 */
export const tHelp = help.messages;

/** `tHelp` を読み込む。 */
export const loadHelpMessages = help.load;
