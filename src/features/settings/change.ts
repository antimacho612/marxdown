/**
 * 設定 UI からの変更（F-CONF-05 / 02.architecture/04-rust-responsibilities.md §5）。
 *
 * **このモジュールは遅延チャンク側にある。** 設定を開くまでロードされない。
 * `main` に残るのは「値を見た目に当てる」`appearance.ts` とストアだけで、
 * 書き戻しの経路はここに寄せてある（06.roadmap/m1.5-shell-and-settings.md §3 の完了条件）。
 *
 * # 見た目は即座に、ファイルは遅れて
 *
 * 入力欄を 1 文字打つたびにファイルを書くと、`preview.fontFamily` を
 * 「N」「o」「t」…と打つ間じゅう `settings.json` が書き換わる。
 * `zoom.ts` と同じく、**当てるのは即座・保存はデバウンス**に分ける。
 * 設定を試行錯誤しながら使えることが M1.5 の目的そのものなので（§4.5）、
 * 遅らせてよいのは保存だけである。
 *
 * # 楽観的に当てる
 *
 * 書き戻しの結果を待たずにストアへ入れる。Rust 側は範囲外の数値を潰して返すが、
 * こちらも同じ範囲（`LIMITS`）で潰してから当てているので、返ってくる値は一致する。
 */
import { describeOpenError } from '@/features/document/open';
import { documentStore } from '@/features/document/store.svelte';
import { DEFAULT_SETTINGS, getPlatform, type Settings, type SettingsPatch } from '@/platform';

import { applyAppearance, clampSetting, LIMITS } from './appearance';
import { settingsStore } from './store.svelte';

/** 保存を待つ時間。`zoom.ts` の `PERSIST_DEBOUNCE_MS` と同じ理由・同じ値。 */
const PERSIST_DEBOUNCE_MS = 400;

let timer: ReturnType<typeof setTimeout> | null = null;

/**
 * まだ書いていない変更。
 *
 * キー単位で積むので、同じ項目を連続でいじっても書き込みは 1 回で済む。
 * **`null` は「キーを消す」**（＝既定値に戻す）で、Rust 側の `patched` が
 * そのまま行ごと削除する。既定値を書き込む形にしないのは、
 * 既定値が変わったときに追従させるため（§4.5）。
 */
let pending: SettingsPatch = {};

function isNumeric(key: keyof Settings): key is keyof typeof LIMITS {
  return key in LIMITS;
}

/**
 * 1 項目を変える。`null` を渡すと既定に戻る。
 *
 * 呼び出し側（設定 UI）は `settings.json` が壊れていないことを確かめてから呼ぶ。
 * 壊れているときは Rust 側が拒否するので**ファイルは無事**だが、
 * 「保存できたように見えて実は書けていない」状態になる。
 */
export function changeSetting<K extends keyof Settings>(key: K, value: Settings[K] | null): void {
  const resolved = resolve(key, value);

  settingsStore.values = { ...settingsStore.values, [key]: resolved };
  applyAppearance(settingsStore.values);

  // **既定値と同じになったら、行を消す。**「既定に戻す」ボタンと、テーマで
  // 「OS に合わせる」を選び直すことと、`16` と打ち直すことが、
  // ファイルの上で同じ結果になる。既定値が変わったときに追従するのも
  // 消しておいた側だけである（§4.5）。
  pending = { ...pending, [key]: resolved === DEFAULT_SETTINGS[key] ? null : resolved };
  schedulePersist();
}

/** 見た目に当てる値を決める。`null`（既定に戻す）は既定値そのもの。 */
function resolve<K extends keyof Settings>(key: K, value: Settings[K] | null): Settings[K] {
  if (value === null) return DEFAULT_SETTINGS[key];
  if (isNumeric(key) && typeof value === 'number') {
    return clampSetting(key, value) as Settings[K];
  }
  return value;
}

function schedulePersist(): void {
  if (timer !== null) clearTimeout(timer);
  // **1 回きりの `setTimeout` であって、ポーリングではない**
  // （05.performance-budget/04-targets.md §5）。
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
    // 書けなかったことは必ず見せる。設定 UI は「効いているように見えている」ので、
    // 黙ると次の起動で値が戻って初めて気づくことになる。
    documentStore.notice = { level: 'error', message: describeOpenError(e, '') };
    return;
  }

  // 書いている間に続きを打たれていたら、そちらが新しい。**古い結果で上書きしない。**
  if (Object.keys(pending).length > 0) return;

  settingsStore.values = saved;
  applyAppearance(saved);
}

/** テスト用。デバウンス中の書き込みを今すぐ流す。 */
export async function flushSettingWrites(): Promise<void> {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  await persist();
}
