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
