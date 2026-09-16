/**
 * 配色の入口（ADR-0014 / 02.architecture/03-layers.md §2）。
 *
 * 組み込みの 50 枚（`lazy/presets.ts`）とカタログ（`lazy/catalog.ts`）は `theme` チャンクにあり、静的 import にしてはいけない。
 * `editor` / `settings` のどちらかに取り込まれると、50 枚ぶんの色が予算の対象外のチャンク（Monaco）に紛れる（`vite.config.ts` の `isThemeOnly`）。
 *
 * `main` に残るのは注入（`inject.ts`）・通知（`notice.ts`）と、プレビュー面の適用経路だけである。
 * プレビューは起動直後に見えている面であり、選ばれている配色を本文の描画より前に当てる必要がある。
 * `themes/` 由来の 1 枚は bootstrap に同梱されて届くため、その場合はカタログを読まずに当たる。
 * 組み込みの配色を選んでいる場合だけチャンクの取得を待つが、その取得は bootstrap の処理と重なるため、本文が読めるまでの時間はほとんど増えない。
 */
import { clearTheme, injectTheme, type ApplyResult } from './inject';
import type * as CatalogModule from './lazy/catalog';
import { reportThemeResult } from './notice';

export { clearTheme, injectTheme } from './inject';
export type { ApplyResult, Surface } from './inject';
export type { ThemeSummary } from './lazy/preset';
export { reportThemeResult } from './notice';

type Catalog = typeof CatalogModule;

/** 配色を選んでいない状態。属性を付けず、`tokens.css` のトークンをそのまま使う（F-CONF-02）。 */
export const DEFAULT_THEME_ID = 'default';

/**
 * 1 度だけ読み込む。
 *
 * 呼び出し元はプレビュー・エディター・設定ダイアログの 3 つあり、複数が重なることは普通に起こる。
 * `import()` 自体もモジュールを二重評価しないが、`Promise` を保持しておくと呼び出し側が解決済みかどうかを気にせずに済む。
 */
let catalogPending: Promise<Catalog> | null = null;

/** 解決済みのカタログ。`themes/` の変更に同期的に応じるために保持する。 */
let catalog: Catalog | null = null;

/** 配色のカタログを読み込む。2 回目以降は同じ `Promise` を返す。 */
export function loadThemeCatalog(): Promise<Catalog> {
  catalogPending ??= loadOnce();
  return catalogPending;
}

async function loadOnce(): Promise<Catalog> {
  catalog = await import('./lazy/catalog');
  return catalog;
}

/** `themes/` の 1 枚。bootstrap から届く形と、カタログが持つ形の両方がこれに当たる。 */
interface Declarations {
  id: string;
  declarations: string;
}

/**
 * bootstrap に同梱されていた、プレビューで選ばれている `themes/` の 1 枚。
 *
 * Rust 側は選択中の id に一致するファイルがあるときだけ載せる（`src-tauri/src/themes.rs`）。
 * 組み込みの配色を選んでいる場合と、存在しない綴りの場合は `null` で届く。
 */
let primed: Declarations | null = null;

/** 最後に適用を開始した id。取得を待っているあいだに選択が変わったことを判定するために持つ。 */
let selected: string = DEFAULT_THEME_ID;

/** プレビューの適用が非同期になった場合の待ち先。起動時だけ意味を持つ。 */
let previewPending: Promise<void> | null = null;

/** 直近の適用結果。通知は本文を描いた後に出すため、ここで保持して後から取り出す。 */
let previewResult: ApplyResult = 'default';

/** 通知を出してよいか。起動中は本文の描画が通知を閉じるため、描き終わるまで抑える。 */
let notifies = false;

/**
 * bootstrap の 1 枚を受け取る。`initSettings` より前に 1 回だけ呼ぶ。
 *
 * 値を渡すだけで適用はしない。
 * 適用の起点を設定値だけにしておくと、起動と設定変更で経路が分かれない。
 */
export function primePreviewTheme(theme: Declarations | null): void {
  primed = theme;
}

/**
 * プレビューの配色を当てる。`features/settings/appearance.ts` から設定値の適用として呼ばれる。
 *
 * 同期的に当たるのは `default` と bootstrap 由来の 1 枚だけで、組み込みの配色はカタログの取得を待つ。
 * 起動時の待ちは `awaitPreviewTheme()` が引き受ける。
 * 起動後（設定 UI からの変更・`settings.json` の外部編集）はカタログが解決済みであるため、待ちはマイクロタスク 1 つで済む。
 */
export function applyPreviewTheme(id: string): void {
  selected = id;
  previewPending = null;

  if (id === DEFAULT_THEME_ID) {
    clearTheme('preview');
    settle('default');
    return;
  }

  if (primed?.id === id) {
    settle(injectTheme('preview', id, primed.declarations));
    return;
  }

  previewPending = applyFromCatalog(id);
}

/**
 * カタログの取得を待って当てる。起動時に本文を描くより前へ差し込む。
 *
 * 待ち先が無ければ即座に解決する。
 * 既定の配色で起動した場合がこれにあたり、`theme` チャンクは 1 バイトも読み込まれない。
 */
export function awaitPreviewTheme(): Promise<void> {
  return previewPending ?? Promise.resolve();
}

/**
 * 通知の抑制を解除する。本文を描いた後に 1 回だけ呼ぶ。
 *
 * 起動中に出すと、`openDocument` が描画に成功した時点で閉じてしまう。
 * 保持しておいた結果をここで出し直す。
 */
export function enableThemeNotices(): void {
  notifies = true;
  reportThemeResult(previewResult);
}

/**
 * `themes/` の外部変更に追従する。`ready()` の後に 1 回だけ呼ぶ。
 *
 * 既定の配色で起動した場合は何もしない。
 * ここでカタログを読むと、配色を使っていない人にも `theme` チャンクを読ませることになる。
 * 起動後に配色を選んだ場合は `applyFromCatalog` が同じ購読を張るため、取りこぼさない。
 */
export async function installPreviewThemeWatch(): Promise<void> {
  if (selected === DEFAULT_THEME_ID) return;

  const loaded = await loadThemeCatalog();
  loaded.installThemesWatch(reapplyPreview);
}

/**
 * カタログ側で当てる。
 *
 * `themes/` を読み直すのは、bootstrap に載らなかった綴りだけがここへ来るためである。
 * 起動直後であれば組み込みの配色か、存在しない綴りのどちらかなので、この読み直しは空振りに終わる。
 * それでも読むのは、起動後に `themes/` へ置かれたファイルを選んだ場合が同じ経路を通るからである。
 */
async function applyFromCatalog(id: string): Promise<void> {
  const loaded = await loadThemeCatalog();
  await loaded.refreshUserThemes();

  // 待っているあいだに別の配色が選ばれていれば、こちらの結果は捨てる。
  if (selected !== id) return;

  settle(loaded.applyTheme('preview', id));
  loaded.installThemesWatch(reapplyPreview);
}

/**
 * `themes/` が書き換えられたときの当て直し。
 *
 * モジュールに 1 つだけ持つ。
 * 呼ぶたびに関数を作ると、購読側が同一性で畳めず登録が積み上がる。
 */
function reapplyPreview(): void {
  // bootstrap の 1 枚は既に古い。ファイルが書き換えられた以上、読み直した結果だけが正しい。
  primed = null;
  if (!catalog || selected === DEFAULT_THEME_ID) return;

  settle(catalog.applyTheme('preview', selected));
}

function settle(result: ApplyResult): void {
  previewResult = result;
  if (notifies) reportThemeResult(result);
}
