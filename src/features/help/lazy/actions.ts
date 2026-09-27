/**
 * ヘルプの各項目の実体（F-OS-09）。`help` チャンクの入口である。
 */
import type { HelpAction } from '..';
import { openAbout } from './about';
import { bugReportUrl, FEATURE_REQUEST_URL } from './links';
import { appInfoOrNull, openBundled, openPage } from './open';

export async function runHelp(action: HelpAction): Promise<void> {
  switch (action) {
    case 'about': {
      openAbout();
      return;
    }
    case 'reportIssue': {
      await openPage(bugReportUrl(await appInfoOrNull()));
      return;
    }
    case 'suggestFeature': {
      await openPage(FEATURE_REQUEST_URL);
      return;
    }
    case 'license':
    case 'thirdPartyNotices': {
      await openBundled(action);
      return;
    }
  }
}
