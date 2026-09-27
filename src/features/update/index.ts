/**
 * update feature の公開面（ADR-0024）。
 *
 * 確認の契機も適用も Rust 側にある。
 * `main` に常駐するのはイベントの購読とコマンドの入口だけで、通知バーの中身・操作・文言は `lazy/notice.ts`（`update` チャンク）にある。
 * 更新が見つかるのは多くても 1 日 1 回であり、それまで読み込む理由が無い。
 */
import { getPlatform } from '@/platform';

/** 自動の確認で見つかった更新を購読する。起動時に 1 回だけ呼ぶ。 */
export function installUpdateNotice(): void {
  getPlatform().onUpdateAvailable(async (info) => {
    const { notifyAvailable } = await import('./lazy/notice');
    notifyAvailable(info);
  });
}

/** 手動の確認（コマンドパレットの「更新を確認」）。`update` チャンクはここで初めて読み込まれる。 */
export async function checkForUpdatesLazily(): Promise<void> {
  const { checkForUpdates } = await import('./lazy/notice');
  await checkForUpdates();
}
