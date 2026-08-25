/**
 * ユーザー設定（F-CONF-03 / 02.architecture.md §4.5 / §8.1）。
 *
 * # 真実はファイルの側にある
 *
 * このストアは `settings.json` の写しであり、初期値は bootstrap に同梱されて届く。
 * **IPC で取りに行く経路を作らない。** 見た目に効く値（テーマ / 本文幅 / フォント）は
 * 本文を描くより前に当たっている必要があり、往復を挟むと FOUC になる（§5.1）。
 *
 * # ここに置くのは設定の値だけ
 *
 * ADR-0005 の禁止（本文をリアクティブな状態に置かない）は設定にも同じく効く。
 * 「壊れている」という事実は通知バー（`documentStore.notice`）に流して終わりにし、
 * ここには残さない。状態を 2 か所に持つと、直したあとに片方だけ残る。
 */
import { documentStore } from '@/features/document/store.svelte';
import { ja } from '@/i18n/ja';
import { DEFAULT_SETTINGS, getPlatform, type Bootstrap, type Settings, type SettingsProblem } from '@/platform';

class SettingsStore {
  /**
   * 設定の全体。**既定値で埋まった後の姿**が入る（欠けたキーは Rust 側で埋まる）。
   * 実際に見た目へ適用するのは M1.5 Phase 4 以降。
   */
  values = $state<Settings>(DEFAULT_SETTINGS);
}

export const settingsStore = new SettingsStore();

/**
 * bootstrap から**同期的に**初期化する。
 *
 * 本文を描くより前に呼ぶこと。倍率（`applyZoom`）と同じ理由で、
 * 後から当てると一度既定の見た目で描かれてから切り替わる。
 */
export function initSettings(bootstrap: Bootstrap | null): void {
  settingsStore.values = bootstrap?.settings ?? DEFAULT_SETTINGS;
}

/**
 * 外部エディタでの編集を即反映する（02.architecture.md §4.5）。起動時に 1 回だけ呼ぶ。
 *
 * IPC を伴う購読なので **`ready()` の後**に呼ぶこと（§5.1）。
 * 監視の登録は Rust 側が起動時に済ませている（パスを知っているのはあちらだけ）。
 */
export function installSettingsWatch(): void {
  getPlatform().onSettingsChanged(() => void refreshSettings());
}

/**
 * `settings.json` を読み直して全体を当て直す（§4.5）。
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

  settingsStore.values = loaded.values;

  if (loaded.broken) {
    reportSettingsProblem(loaded.broken);
    return;
  }
  // 直っていたら、消えない通知を自分で下げる。壊れている間だけ出るべきものなので、
  // ユーザーが直したのに残り続けると「まだ直っていない」と読めてしまう。
  if (documentStore.notice?.message === ja.settings.broken) documentStore.notice = null;
}

/**
 * 壊れた `settings.json` を知らせる（03.ux-spec.md §8.2）。
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
