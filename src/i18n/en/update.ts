/** 更新の通知だけが使う英語の文言。キーの構成は `ja/update.ts` に合わせる。 */
import type { UpdateMessages } from '../types';

export const enUpdate = {
  available: (version: string) => `Marxdown ${version} is available`,
  install: 'Update and Restart',
  notes: 'Release Notes',
  downloading: 'Downloading the update…',
  dirty: 'There are unsaved changes. Save them before updating',
  upToDate: 'Marxdown is up to date',
  checkFailed: 'Could not check for updates. Check your network connection',
  installFailed: 'Could not update. Try again later',
  manual: 'The preview for this OS does not update automatically. Get new versions from Releases',
  openReleases: 'Open Releases',
} satisfies UpdateMessages;
