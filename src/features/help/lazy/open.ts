/**
 * ヘルプから外部のページと同梱ファイルを開く（F-OS-09）。
 *
 * 失敗は通知バーに出す。
 * どれも利用者が選んで実行したものであり、何も起きないまま終わると押せていないように見える。
 */
import { documentStore } from '@/features/document';
import { tHelp } from '@/i18n/help';
import { getPlatform, type AppInfo, type BundledFile } from '@/platform';

export async function openPage(url: string): Promise<void> {
  try {
    await getPlatform().openExternal(url);
  } catch (error) {
    console.warn('[marxdown] ページを開けなかった', error);
    documentStore.notice = { level: 'error', message: tHelp.openPageFailed };
  }
}

export async function openBundled(file: BundledFile): Promise<void> {
  try {
    await getPlatform().openBundledFile(file);
  } catch (error) {
    console.warn('[marxdown] 同梱のライセンス文を開けなかった', error);
    documentStore.notice = { level: 'error', message: tHelp.openLicenseFailed };
  }
}

/** 取得できなければ `null`。不具合の報告は情報が無くても続けられるため、失敗を通知しない。 */
export async function appInfoOrNull(): Promise<AppInfo | null> {
  try {
    return await getPlatform().appInfo();
  } catch (error) {
    console.warn('[marxdown] アプリの情報を取得できなかった', error);
    return null;
  }
}
