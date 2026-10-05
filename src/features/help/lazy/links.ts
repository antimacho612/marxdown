/**
 * ヘルプから開く外部のページ（F-OS-09）。
 *
 * 不具合の報告は、GitHub の Issue フォームの欄を URL のクエリで埋めて開く。
 * クエリの名前は `.github/ISSUE_TEMPLATE/bug_report.yml` の各欄の `id` である。
 * 欄の `id` を変えたら、ここも合わせる（`links.test.ts` が突き合わせる）。
 */
import type { AppInfo } from '@/platform';

export const REPOSITORY_URL = 'https://github.com/antimacho612/marxdown';

export const FEATURE_REQUEST_URL = `${REPOSITORY_URL}/issues/new?template=feature_request.yml`;

/** 著作権の表示。`tauri.conf.json` の `bundle.copyright` と同じ文字列にする（`links.test.ts` が突き合わせる）。 */
export const COPYRIGHT = '© 2026 antimacho612';

/**
 * 不具合報告のフォームの URL。
 *
 * 情報を取得できなかったときは欄を埋めずに開く。報告できないことのほうが、欄が空であることより困る。
 */
export function bugReportUrl(info: AppInfo | null): string {
  const params = new URLSearchParams({ template: 'bug_report.yml' });
  if (info) {
    params.set('version', info.version);
    params.set('os', info.os);
    // WebView の版を書く欄は無い。
    // 表示の不具合では原因の切り分けに要るため、自由記述の欄に入れておく。
    if (info.webview !== null) params.set('extra', `WebView: ${info.webview}`);
  }
  return `${REPOSITORY_URL}/issues/new?${params.toString()}`;
}

/** 「情報をコピー」で書き出す文字列。不具合の報告にそのまま貼れる形にする。 */
export function describeInfo(info: AppInfo, unknown: string): string {
  return [`Marxdown: ${info.version}`, `OS: ${info.os}`, `WebView: ${info.webview ?? unknown}`].join('\n');
}
