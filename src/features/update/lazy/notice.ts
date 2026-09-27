import { documentStore } from '@/features/document';
import { jaUpdate } from '@/i18n/ja-update';
import { getPlatform, type UpdateInfo } from '@/platform';

/**
 * 自動の確認で見つかった版を通知バーに出す。
 *
 * 既に別の通知が出ているときは出さない。
 * 外部での変更や保存の失敗は、利用者が選ぶまで残すべき通知であり、更新の案内で上書きしてはいけない。
 * 出せなかった分は、次の確認（24 時間後）か手動の確認で改めて出る。
 */
export function notifyAvailable(info: UpdateInfo): void {
  if (documentStore.notice === null) showAvailable(info);
}

/**
 * 手動の確認（コマンドパレットの「更新を確認」）。
 *
 * 利用者が求めた確認であるため、結果は必ず伝える。
 * 新しい版が無いことは済んだことの報告としてステータスバーへ、失敗は通知バーへ出す（03.ux-spec/07-status-and-notifications.md §2.1）。
 */
export async function checkForUpdates(): Promise<void> {
  try {
    const info = await getPlatform().checkUpdate();
    if (info) {
      showAvailable(info);
    } else {
      documentStore.statusMessage = jaUpdate.upToDate;
    }
  } catch (error) {
    // 詳細（reqwest のエラー文）は利用者に見せない（docs/conventions/02-ui-wording.md §1）。
    console.warn('[marxdown] 更新の確認に失敗した', error);
    documentStore.notice = { level: 'error', message: jaUpdate.checkFailed };
  }
}

function showAvailable(info: UpdateInfo): void {
  documentStore.notice = {
    level: 'info',
    message: jaUpdate.available(info.version),
    actions: [
      { label: jaUpdate.install, run: () => void install() },
      { label: jaUpdate.notes, run: () => void getPlatform().openExternal(info.notesUrl) },
    ],
  };
}

/**
 * 更新を適用する。
 *
 * Windows では更新を始めた時点でプロセスが終わるため、ここへ戻るのは始めなかったときか失敗したときだけである。
 * 未保存の変更があれば Rust 側が始めずに戻る。
 * そのときは同じ操作を残し、保存してからもう一度押せるようにする（ADR-0024 §3.6）。
 */
async function install(): Promise<void> {
  // ダウンロードには数秒かかる。押した結果が何も見えない時間を作らない。
  documentStore.notice = { level: 'info', message: jaUpdate.downloading };
  try {
    const refusal = await getPlatform().installUpdate();
    if (refusal === 'dirty') {
      documentStore.notice = {
        level: 'warning',
        message: jaUpdate.dirty,
        actions: [{ label: jaUpdate.install, run: () => void install() }],
      };
    } else {
      documentStore.notice = null;
      documentStore.statusMessage = jaUpdate.upToDate;
    }
  } catch (error) {
    console.warn('[marxdown] 更新の適用に失敗した', error);
    documentStore.notice = { level: 'error', message: jaUpdate.installFailed };
  }
}
