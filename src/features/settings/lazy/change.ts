/**
 * 設定 UI からの変更（F-CONF-05 / 02.architecture/04-rust-responsibilities.md §5）。
 * 遅延チャンク側にあり、`main` には見た目適用（`appearance.ts`）とストアだけが残る。
 *
 * 見た目は即座に当て、保存はデバウンスする（`zoom.ts` と同じ）。
 * 1 文字ごとに `settings.json` を書かないためである。
 * 書き戻しの結果を待たずに楽観的にストアへ入れるのは、Rust 側も同じ範囲（`SETTINGS_SCHEMA`）で潰すため返り値が一致するからである。
 */
import { describeOpenError, documentStore } from '@/features/document';
import { reloadTree } from '@/features/workspace';
import {
  clampSetting,
  DEFAULT_SETTINGS,
  getPlatform,
  isNumericKey,
  type Settings,
  type SettingsPatch,
} from '@/platform';

import { applyAppearance } from '../appearance';
import { settingsStore } from '../store.svelte';

/** 保存を待つ時間。`zoom.ts` の `PERSIST_DEBOUNCE_MS` と同じ理由・同じ値。 */
const PERSIST_DEBOUNCE_MS = 400;

let timer: ReturnType<typeof setTimeout> | null = null;

/**
 * まだ書いていない変更。
 *
 * キー単位で蓄積するため、同じ項目を連続で変更しても書き込みは 1 回で済む。
 * `null` はキーの削除を意味し（既定値に戻す）、Rust 側の `patched` がその行ごと削除する。
 * 既定値を書き込む形にしないのは、既定値が変わったときに追従させるためである（02.architecture/04-rust-responsibilities.md §5）。
 */
let pending: SettingsPatch = {};

/**
 * 1 項目を変える。`null` を渡すと既定に戻る。
 *
 * 呼び出し側（設定 UI）は `settings.json` が壊れていないことを確認してから呼ぶ。
 * 壊れている場合は Rust 側が拒否するためファイルは変更されないが、保存できたように見えて実際には書き込まれていない状態になる。
 */
export function changeSetting<K extends keyof Settings>(key: K, value: Settings[K] | null): void {
  const resolved = resolve(key, value);

  settingsStore.values = { ...settingsStore.values, [key]: resolved };
  applyAppearance(settingsStore.values);

  // 既定値と同じになったらキーを削除する。
  // 「既定に戻す」ボタン、テーマで「OS に合わせる」を選び直す操作、既定値と同じ値を入力し直す操作が、ファイル上で同じ結果になる。
  // 既定値が変わったときに追従するのも、削除しておいた場合だけである（同上）。
  pending = { ...pending, [key]: resolved === DEFAULT_SETTINGS[key] ? null : resolved };
  schedulePersist();
}

/** 見た目に当てる値を決める。`null`（既定に戻す）は既定値そのもの。 */
function resolve<K extends keyof Settings>(key: K, value: Settings[K] | null): Settings[K] {
  if (value === null) return DEFAULT_SETTINGS[key];
  if (isNumericKey(key) && typeof value === 'number') {
    return clampSetting(key, value) as Settings[K];
  }
  return value;
}

function schedulePersist(): void {
  if (timer !== null) clearTimeout(timer);
  // 1 回だけの `setTimeout` であり、ポーリングではない（05.performance-budget/04-targets.md §5）。
  timer = setTimeout(() => {
    timer = null;
    void persist();
  }, PERSIST_DEBOUNCE_MS);
}

async function persist(): Promise<void> {
  const patch = pending;
  pending = {};
  if (Object.keys(patch).length === 0) return;

  let saved: Settings;
  try {
    saved = await getPlatform().writeSettings(patch);
  } catch (e) {
    // 書き込みの失敗は必ず通知する。
    // 設定 UI 上は反映されたように見えるため、通知しないと次の起動で値が戻って初めて判明する。
    documentStore.notice = { level: 'error', message: describeOpenError(e, '') };
    return;
  }

  // 書き込み中に別の変更があった場合は、そちらが新しい値になる。古い結果で上書きしない。
  if (Object.keys(pending).length > 0) return;

  settingsStore.values = saved;
  applyAppearance(saved);

  // 除外の glob が変わったらファイルツリーを読み直す（#146）。
  // `changeSetting` ではなくここで行うのは、打鍵のたびに木を読み直さないためである。
  // 保存はデバウンスされており、入力が止まってから 1 回だけ通る。
  if ('explorer.exclude' in patch) void reloadTree();
}

/** テスト用。デバウンス中の書き込みを今すぐ流す。 */
export async function flushSettingWrites(): Promise<void> {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  await persist();
}
