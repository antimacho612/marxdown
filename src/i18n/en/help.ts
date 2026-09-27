/** ヘルプだけが使う英語の文言。キーの構成は `ja/help.ts` に合わせる。 */
import type { HelpMessages } from '../types';

export const enHelp = {
  version: 'Version',
  unknown: 'Unknown',
  license: 'Released under the MIT License.',
  copyInfo: 'Copy Info',
  infoCopied: 'Copied the version info',
  infoCopyFailed: 'Could not copy the version info',
  openPageFailed: 'Could not open the page',
  openLicenseFailed: 'Could not open the license file',
} satisfies HelpMessages;
