/**
 * ユーザー設定（F-CONF-03 / 02.architecture/04-rust-responsibilities.md §5）。
 *
 * 真実は `settings.json` 側にあり、このストアはその写しである。
 * 初期値は bootstrap に同梱されて届くため IPC で取りに行く経路は作らない（往復を挟むと FOUC になる）。
 * 「壊れている」という事実は通知バー（`documentStore.notice`）に流すだけでここには残さない（ADR-0005。状態を 2 か所に持つと直した後に片方だけ残る）。
 */
import { documentStore } from '@/features/document/store.svelte';
import { ja } from '@/i18n/ja';
import { DEFAULT_SETTINGS, getPlatform, type Bootstrap, type Settings, type SettingsProblem } from '@/platform';

import { applyAppearance } from './appearance';

class SettingsStore {
  /**
   * 設定の全体。**既定値で埋まった後の姿**が入る（欠けたキーは Rust 側で埋まる）。
   *
   * 見た目への適用は `applyAppearance` が担当する。**このストアを購読して
   * 当てる形にはしていない**（`$effect` を張ると、当たる瞬間が
   * マイクロタスク以降にずれて初期フレームに間に合わない）。
   * 値が変わる場所は 3 つしかないので、そこで明示的に呼ぶ。
   */
  values = $state<Settings>(DEFAULT_SETTINGS);
}

export const settingsStore = new SettingsStore();

/**
 * bootstrap から**同期的に**初期化し、その場で見た目に当てる。
 *
 * 本文を描くより前に呼ぶこと。倍率（`applyZoom`）と同じ理由で、
 * 後から当てると一度既定の見た目で描かれてから切り替わる。
 */
export function initSettings(bootstrap: Bootstrap | null): void {
  settingsStore.values = bootstrap?.settings ?? DEFAULT_SETTINGS;
  applyAppearance(settingsStore.values);
}

/**
 * 外部エディタでの編集を即反映する（02.architecture/04-rust-responsibilities.md §5）。起動時に 1 回だけ呼ぶ。
 *
 * IPC を伴う購読なので **`ready()` の後**に呼ぶこと（02.architecture/05-startup-sequence.md §1）。
 * 監視の登録は Rust 側が起動時に済ませている（パスを知っているのはあちらだけ）。
 */
export function installSettingsWatch(): void {
  getPlatform().onSettingsChanged(() => void refreshSettings());
}

/**
 * `settings.json` を読み直して全体を当て直す（§5）。
 *
 * **差分適用にしない。** 設定は 1KB 未満で、部分更新の一貫性を気にするより
 * 読み直すほうが確実に安い。
 *
 * **読めない内容に変わっても既定値に戻さない。** 直前に読めていた値を保つのは
 * Rust 側（`AppState::reload_settings`）の担当で、ここはその結果を映すだけ。
 * 保存の途中で一瞬 JSON として壊れた状態を経由するのは普通のことであり、
 * そのたびにテーマが飛んでは設定を試行錯誤できない。
 */
export async function refreshSettings(): Promise<void> {
  let loaded;
  try {
    loaded = await getPlatform().readSettings();
  } catch {
    // 読み直せなかったこと自体は伝えない。直前の値のまま動き続ける
    return;
  }

  // 外部エディタでの編集も、設定 UI からの変更と同じ 1 本を通って見た目に届く。
  // **ここが「設定を試行錯誤しながら使える」の実体**（02.architecture/04-rust-responsibilities.md §5）。
  settingsStore.values = loaded.values;
  applyAppearance(loaded.values);

  if (loaded.broken) {
    reportSettingsProblem(loaded.broken);
    return;
  }
  // 直っていたら、消えない通知を自分で下げる。壊れている間だけ出るべきものなので、
  // ユーザーが直したのに残り続けると「まだ直っていない」と読めてしまう。
  if (documentStore.notice?.message === ja.settings.broken) documentStore.notice = null;
}

/**
 * 壊れた `settings.json` を知らせる（03.ux-spec/07-status-and-notifications.md §2）。
 *
 * **消えない**エラー通知にする。既定値で動いてしまう以上、
 * 黙っていると「設定が効かない」としか見えない。
 * `ファイルを開く` を添えるのは、直す場所がファイルしかないため（F-CONF-06）。
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
