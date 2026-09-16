/**
 * 選ばれている配色をエディター面へ効かせる（`editor` チャンク / ADR-0014）。
 *
 * `theme.ts` は面に効いているトークンを Monaco へ写す係で、そのトークンを用意するのがここである。
 * 順序に意味がある。注入してからでないと `applyEditorTheme()` は既定のトークンを読む。
 *
 * 属性（`data-mx-editor-theme`）を付けるのは `main` 側（`features/settings/appearance.ts`）で、起動直後から付いている。
 * 属性に意味を与える規則だけが遅れて届く形になっているが、`#mx-editor` は Monaco がマウントされるまで空であるため、その間に見えるものは無い。
 * プレビュー側は起動直後から見えているため経路が違う（`features/theme/index.ts`）。
 */
import { settingsStore } from '@/features/settings';
import { loadThemeCatalog, reportThemeResult } from '@/features/theme';

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

  catalog.installThemesWatch(() => {
    // id が同じままでも中身は変わっている。
    applied = null;
    reapply();
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
  reportThemeResult(catalog.applyTheme('editor', id));
}
