/**
 * 設定画面だけが使う文言（F-CONF-05）。
 *
 * 使う側は遅延チャンク（`features/settings/lazy/` と、そこから読み込む配色の選択欄）にあるため、`t` とは分けて、設定を開くまで読み込まない。
 * `settings.json` を読めなかったことの通知は起動時に出るため、その文言だけは `t.settings` に残してある。
 */
import { lazyMessages } from './index';
import type { SettingsMessages } from './types';

const settings = lazyMessages<SettingsMessages>({
  ja: async () => {
    const { jaSettings } = await import('./ja/settings');
    return jaSettings;
  },
  en: async () => {
    const { enSettings } = await import('./en/settings');
    return enSettings;
  },
});

/** 表示言語の設定画面の文言。`loadSettingsMessages()` が完了するまで空である。 */
export const tSettings = settings.messages;

/** `tSettings` を読み込む。 */
export const loadSettingsMessages = settings.load;
