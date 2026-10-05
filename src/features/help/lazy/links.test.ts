import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { bugReportUrl, COPYRIGHT, describeInfo, FEATURE_REQUEST_URL } from './links';

const ROOT = resolve(import.meta.dirname, '../../../..');

function read(path: string): string {
  return readFileSync(resolve(ROOT, path), 'utf8');
}

/** Issue フォームの欄の `id` の一覧。 */
function fieldIds(template: string): string[] {
  return Array.from(read(`.github/ISSUE_TEMPLATE/${template}`).matchAll(/^\s+id: (\S+)$/gmu), (m) => m[1] ?? '');
}

const INFO = { version: '1.2.3', os: 'Windows 11 24H2 (26100.4061)', webview: '131.0.2903.70' };

describe('不具合報告の URL (F-OS-09)', () => {
  it('バージョン・OS・WebView の版で欄を埋める', () => {
    const url = new URL(bugReportUrl(INFO));

    expect(url.origin + url.pathname).toBe('https://github.com/antimacho612/marxdown/issues/new');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      template: 'bug_report.yml',
      version: '1.2.3',
      os: 'Windows 11 24H2 (26100.4061)',
      extra: 'WebView: 131.0.2903.70',
    });
  });

  it('情報を取得できなかったときは欄を埋めずに開く', () => {
    expect(bugReportUrl(null)).toBe('https://github.com/antimacho612/marxdown/issues/new?template=bug_report.yml');
  });

  it('WebView の版が無ければ自由記述の欄を埋めない', () => {
    const url = new URL(bugReportUrl({ ...INFO, webview: null }));
    expect(url.searchParams.has('extra')).toBe(false);
  });

  /** クエリの名前は欄の `id` と一致していないと、黙って無視される。 */
  it('埋める欄はテンプレートに実在する', () => {
    const ids = fieldIds('bug_report.yml');
    const { searchParams } = new URL(bugReportUrl(INFO));
    searchParams.delete('template');

    expect(Array.from(searchParams.keys()).filter((key) => !ids.includes(key))).toEqual([]);
  });

  it('指定したテンプレートが実在する', () => {
    const template = new URL(FEATURE_REQUEST_URL).searchParams.get('template') ?? '';
    expect(() => read(`.github/ISSUE_TEMPLATE/${template}`)).not.toThrow();
  });
});

describe('Marxdown について', () => {
  it('著作権の表示はインストーラと同じ', () => {
    const conf = JSON.parse(read('src-tauri/tauri.conf.json')) as { bundle: { copyright: string } };
    expect(COPYRIGHT).toBe(conf.bundle.copyright);
  });

  it('コピーする情報は 1 行に 1 項目', () => {
    expect(describeInfo({ ...INFO, webview: null }, '不明')).toBe(
      'Marxdown: 1.2.3\nOS: Windows 11 24H2 (26100.4061)\nWebView: 不明',
    );
  });
});
