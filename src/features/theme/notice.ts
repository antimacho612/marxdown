/**
 * 配色を適用できなかったことを通知バーに出す（03.ux-spec/07-status-and-notifications.md §2）。
 *
 * 知らない id を既定に置き換えないため（ADR-0014 §3.3）、通知が無いと画面上の手がかりが何も残らない。
 * 選択中の綴りがカタログに無いことと、ファイルの中身が面の外へ出ていたことを区別して伝える。
 *
 * 面で文言を分けない。
 * ユーザーが直す先はどちらも `themes/` の同じファイルであり、どの面に適用されなかったかは設定画面を見れば分かる。
 */
import { documentStore } from '@/features/document';
import { ja } from '@/i18n/ja';
import { getPlatform } from '@/platform';

import type { ApplyResult } from './inject';

/** 自分が出した通知だけを閉じる。他の通知（本文の読み込み失敗など）を消さないためである。 */
const OWN_NOTICES = new Set<string>([ja.themes.unknown, ja.themes.rejected]);

/**
 * 適用結果を通知に反映する。解消していれば自分が出した通知を閉じる。
 *
 * level は warning にする。
 * 本文は読めており、失敗したのは配色の適用だけである。
 *
 * 既に別の通知が表示されているときは出さない。
 * 本文を開けなかった通知のほうが、配色が適用されないことより重要である。
 */
export function reportThemeResult(result: ApplyResult): void {
  const message = result === 'unknown' ? ja.themes.unknown : result === 'rejected' ? ja.themes.rejected : null;

  if (message === null) {
    if (isOwnNotice(documentStore.notice?.message)) documentStore.notice = null;
    return;
  }
  if (documentStore.notice !== null) return;

  documentStore.notice = {
    level: 'warning',
    message,
    actions: [{ label: ja.themes.open, run: () => void getPlatform().openThemesDir() }],
  };
}

function isOwnNotice(message: string | undefined): boolean {
  return message !== undefined && OWN_NOTICES.has(message);
}
