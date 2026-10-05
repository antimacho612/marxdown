import { documentStore } from '@/features/document';
import { loadUpdateMessages, tUpdate } from '@/i18n/update';
import { getPlatform, type UpdateInfo } from '@/platform';

/**
 * 自動の確認で見つかった版を通知バーに出す。
 *
 * 既に別の通知が出ているときは出さない。
 * 外部での変更や保存の失敗は、利用者が選ぶまで残すべき通知であり、更新の案内で上書きしてはいけない。
 * 出せなかった分は、次の確認（24 時間後）か手動の確認で改めて出る。
 */
export async function notifyAvailable(info: UpdateInfo): Promise<void> {
  await loadUpdateMessages();
  if (documentStore.notice === null) showAvailable(info);
}

/** 新しい版を手で入れるときに開くページ。 */
const RELEASES_URL = 'https://github.com/antimacho612/marxdown/releases';

/**
 * 手動の確認（コマンドパレットの「更新を確認」）。
 *
 * 利用者が求めた確認であるため、結果は必ず伝える。
 * 新しい版が無いことは済んだことの報告としてステータスバーへ、失敗は通知バーへ出す。
 *
 * NOTE: macOS / Linux はプレビューの間、updater を使わない（ADR-0028 §3.8 / M10 §4.10 の案 1）。
 * 確認する代わりに Releases の一覧へ誘導する。
 * 卒業の版でこの分岐を外す（`src-tauri/src/update.rs` の `ENABLED` と同時に）。
 */
export async function checkForUpdates(): Promise<void> {
  await loadUpdateMessages();
  if (getPlatform().getBootstrap()?.platform !== 'windows') {
    documentStore.notice = {
      level: 'info',
      message: tUpdate.manual,
      actions: [{ label: tUpdate.openReleases, run: () => void getPlatform().openExternal(RELEASES_URL) }],
    };
    return;
  }
  try {
    const info = await getPlatform().checkUpdate();
    if (info) {
      showAvailable(info);
    } else {
      documentStore.statusMessage = tUpdate.upToDate;
    }
  } catch (error) {
    // 詳細（reqwest のエラー文）は利用者に見せない。
    console.warn('[marxdown] 更新の確認に失敗した', error);
    documentStore.notice = { level: 'error', message: tUpdate.checkFailed };
  }
}

function showAvailable(info: UpdateInfo): void {
  documentStore.notice = {
    level: 'info',
    message: tUpdate.available(info.version),
    actions: [
      { label: tUpdate.install, run: () => void install() },
      { label: tUpdate.notes, run: () => void getPlatform().openExternal(info.notesUrl) },
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
  documentStore.notice = { level: 'info', message: tUpdate.downloading };
  try {
    const refusal = await getPlatform().installUpdate();
    if (refusal === 'dirty') {
      documentStore.notice = {
        level: 'warning',
        message: tUpdate.dirty,
        actions: [{ label: tUpdate.install, run: () => void install() }],
      };
    } else {
      documentStore.notice = null;
      documentStore.statusMessage = tUpdate.upToDate;
    }
  } catch (error) {
    console.warn('[marxdown] 更新の適用に失敗した', error);
    documentStore.notice = { level: 'error', message: tUpdate.installFailed };
  }
}
