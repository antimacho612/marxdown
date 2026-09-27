/**
 * 配色を適用できなかったことを通知バーに出す。
 *
 * 知らない id を既定に置き換えないため（ADR-0014 §3.3）、通知が無いと画面上の手がかりが何も残らない。
 * 選択中の綴りがカタログに無いことと、ファイルの中身が面の外へ出ていたことを区別して伝える。
 *
 * 面で文言を分けない。
 * ユーザーが直す先はどちらも `themes/` の同じファイルであり、どの面に適用されなかったかは設定画面を見れば分かる。
 */
import { documentStore } from '@/features/document';
import { t } from '@/i18n';
import { getPlatform } from '@/platform';

import type { ApplyResult } from './inject';

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
  const message = result === 'unknown' ? t.themes.unknown : result === 'rejected' ? t.themes.rejected : null;

  if (message === null) {
    if (isOwnNotice(documentStore.notice?.message)) documentStore.notice = null;
    return;
  }
  if (documentStore.notice !== null) return;

  documentStore.notice = {
    level: 'warning',
    message,
    actions: [{ label: t.themes.open, run: () => void getPlatform().openThemesDir() }],
  };
}

/** 自分が出した通知だけを閉じる。他の通知（本文の読み込み失敗など）を消さないためである。 */
function isOwnNotice(message: string | undefined): boolean {
  return message === t.themes.unknown || message === t.themes.rejected;
}
