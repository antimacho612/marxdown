/**
 * ユーザー設定（F-CONF-03 / 02.architecture/04-rust-responsibilities.md §5）。
 *
 * 真実は `settings.json` 側にあり、このストアはその写しである。
 * 初期値は bootstrap に同梱されて届くため IPC で取りに行く経路は作らない（往復を挟むと FOUC になる）。
 * 「壊れている」という事実は通知バー（`documentStore.notice`）に流すだけでここには残さない（ADR-0005。状態を 2 か所に持つと直した後に片方だけ残る）。
 */
import { documentStore } from '@/features/document';
import { ja } from '@/i18n/ja';
import { DEFAULT_SETTINGS, getPlatform, type Bootstrap, type Settings, type SettingsProblem } from '@/platform';

import { applyAppearance } from './appearance';

class SettingsStore {
  /**
   * 設定の全体。既定値で埋めた後の状態が入る（欠けたキーは Rust 側で埋められる）。
   *
   * 表示への適用は `applyAppearance` が担当し、このストアを購読して適用する形にはしていない。
   * `$effect` を使うと適用のタイミングがマイクロタスク以降にずれ、初期フレームに間に合わないためである。
   * 値が変わる箇所は 3 か所しかないため、そこで明示的に呼ぶ。
   */
  values = $state<Settings>(DEFAULT_SETTINGS);
}

/** ユーザー設定。モジュールの singleton として共有する。 */
export const settingsStore = new SettingsStore();

/**
 * bootstrap から同期的に初期化し、その場で表示へ適用する。
 *
 * 本文を描画するより前に呼ぶこと。
 * 倍率（`applyZoom`）と同じ理由で、後から適用すると既定の表示で一度描画された後に切り替わる。
 */
export function initSettings(bootstrap: Bootstrap | null): void {
  settingsStore.values = bootstrap?.settings ?? DEFAULT_SETTINGS;
  applyAppearance(settingsStore.values);
}

/**
 * 外部エディターでの編集を即反映する（02.architecture/04-rust-responsibilities.md §5）。起動時に 1 回だけ呼ぶ。
 *
 * IPC を伴う購読であるため、`ready()` の後に呼ぶこと（02.architecture/05-startup-sequence.md §1）。
 * 監視の登録は Rust 側が起動時に済ませている（パスを知っているのは Rust 側だけである）。
 */
export function installSettingsWatch(): void {
  getPlatform().onSettingsChanged(() => void refreshSettings());
}

/**
 * `settings.json` を読み直して全体を当て直す（§5）。
 *
 * 差分適用にはしない。
 * 設定は 1KB 未満であり、部分更新の一貫性を保つより全体を読み直すほうがコストが低い。
 *
 * 読めない内容に変わっても既定値へは戻さない。
 * 直前に読めていた値を保持するのは Rust 側（`AppState::reload_settings`）の担当であり、ここはその結果を反映するだけである。
 * 保存の途中で JSON として一時的に壊れた状態を経由することは通常起こりうるため、そのたびに表示が変わると設定を調整できなくなる。
 */
export async function refreshSettings(): Promise<void> {
  let loaded;
  try {
    loaded = await getPlatform().readSettings();
  } catch {
    // 読み直しに失敗したこと自体は通知しない。直前の値のまま動作を続ける
    return;
  }

  // 外部エディターでの編集も、設定 UI からの変更と同じ経路を通って表示に反映される。
  // 設定を編集しながら結果を確認できるのはこの構造による（02.architecture/04-rust-responsibilities.md §5）。
  settingsStore.values = loaded.values;
  applyAppearance(loaded.values);

  if (loaded.broken) {
    reportSettingsProblem(loaded.broken);
    return;
  }
  // 修正されていれば、自動では消えない通知をここで閉じる。
  // 壊れている間だけ表示すべきものであり、修正後も残ると未修正であるかのように見える。
  if (documentStore.notice?.message === ja.settings.broken) documentStore.notice = null;
}

/**
 * 壊れた `settings.json` を知らせる（03.ux-spec/07-status-and-notifications.md §2）。
 *
 * 自動では消えないエラー通知にする。
 * 既定値で動作してしまうため、通知しないと設定が反映されない理由が分からない。
 * 「ファイルを開く」を添えるのは、修正できる場所がファイルしかないためである（F-CONF-06）。
 */
export function reportSettingsProblem(problem: SettingsProblem | null): void {
  if (!problem) return;

  documentStore.notice = {
    level: 'error',
    message: ja.settings.broken,
    actions: [
      {
        label: ja.settings.openFile,
        run: () => void getPlatform().openSettingsFile(),
      },
    ],
  };
}
