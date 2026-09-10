/**
 * 選ばれている配色をエディター面へ効かせる（`editor` チャンク / ADR-0014）。
 *
 * `theme.ts` は面に効いているトークンを Monaco へ写す係で、そのトークンを用意するのがここである。
 * 順序に意味がある。注入してからでないと `applyEditorTheme()` は既定のトークンを読む。
 *
 * 属性（`data-mx-editor-theme`）を付けるのは `main` 側（`features/settings/appearance.ts`）で、起動直後から付いている。
 * 属性に意味を与える規則だけが遅れて届く形になっているが、`#mx-editor` は Monaco がマウントされるまで空であるため、その間に見えるものは無い。
 */
import { documentStore } from '@/features/document';
import { settingsStore } from '@/features/settings';
import { loadThemeCatalog, type ApplyResult } from '@/features/theme';
import { ja } from '@/i18n/ja';
import { getPlatform } from '@/platform';

type Catalog = Awaited<ReturnType<typeof loadThemeCatalog>>;

let catalog: Catalog | null = null;

/**
 * 最後に注入した id。同じ値なら注入し直さない。
 *
 * `watchEditorSettings` は設定が 1 つでも変われば `reapply` を呼ぶため、フォントサイズを動かしただけでも通過する。
 * `themes/` が書き換えられたときは、id が同じでも中身が違うので `null` へ戻す。
 */
let applied: string | null = null;

/**
 * カタログを読み込み、`themes/` の変更を購読する。マウント時に 1 回だけ呼ぶ。
 *
 * 読み込めた時点で `reapply` を呼び直す。
 * 呼び出し側（`editor.ts`）はマウント直後にも当てているが、そのときはまだ組み込みの配色が存在しない。
 */
export async function installEditorPalette(reapply: () => void): Promise<void> {
  catalog = await loadThemeCatalog();
  await catalog.refreshUserThemes();
  applied = null;
  reapply();

  getPlatform().onUserThemesChanged(() => {
    void reload(reapply);
  });
}

/**
 * 設定で選ばれている配色を当てる。カタログがまだ無ければ何もしない。
 *
 * 同期的に完了する。呼び出し側は続けて `applyEditorTheme()` を呼んでよい。
 */
export function applyEditorPalette(): void {
  const id = settingsStore.values['editor.theme'];
  if (!catalog || id === applied) return;

  applied = id;
  report(catalog.applyTheme(id));
}

/** `themes/` が書き換えられたときの読み直し。 */
async function reload(reapply: () => void): Promise<void> {
  const loaded = catalog;
  if (!loaded) return;

  await loaded.refreshUserThemes();
  // id が同じままでも中身は変わっている。
  applied = null;
  reapply();
}

/**
 * 適用できなかったことを通知バーに出す（03.ux-spec/07-status-and-notifications.md §2）。
 *
 * 知らない id を既定へ落とさないため、通知が無いと画面上の手がかりが何も残らない。
 * 選択中の綴りがカタログに無いことと、ファイルの中身が面の外へ出ていたことを区別して伝える。
 *
 * level は warning にする。本文は読めており、失敗したのは配色の適用だけである。
 * 既に別の通知が表示されているときは出さない（`install-custom-css.ts` の `report` と同じ理由）。
 */
function report(result: ApplyResult): void {
  const message = result === 'unknown' ? ja.themes.unknown : result === 'rejected' ? ja.themes.rejected : null;

  if (message === null) {
    // 解消していれば、自分が出した通知をここで閉じる。
    if (isOwnNotice(documentStore.notice?.message)) documentStore.notice = null;
    return;
  }
  if (documentStore.notice !== null) return;

  documentStore.notice = {
    level: 'warning',
    message,
    actions: [{ label: ja.themes.open, run: () => void getPlatform().openThemesDir() }],
  };
}

/** 自分が出した通知だけを閉じる。他の通知（本文の読み込み失敗など）を消さないためである。 */
const OWN_NOTICES = new Set<string>([ja.themes.unknown, ja.themes.rejected]);

function isOwnNotice(message: string | undefined): boolean {
  return message !== undefined && OWN_NOTICES.has(message);
}
