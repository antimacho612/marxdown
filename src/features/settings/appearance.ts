/**
 * 設定を見た目に当てる（F-CONF-01 / F-CONF-04 / 02.architecture/10-theming.md §1）。
 *
 * 設定 UI は遅延チャンクだが、`main` にはこのファイルとストアだけが残り、`:root` のカスタムプロパティを書き換えるだけの仕事をする。
 * `bootstrap.ts` の `initSettings` から本文描画より前に同期的に呼ぶ（後から適用すると、一度描画された内容が別の見た目に再描画される）。
 * 既定値と同じなら `removeProperty` して `tokens.css` と二重管理にせず、未設定時の見た目を保つ（F-CONF-02）。
 * 適用先はすべてトークン層で、ユーザーのカスタム CSS からも同じ変数として見える。
 */
import { clampSetting, DEFAULT_SETTINGS, type NumericKey, type Palette, type Settings } from '@/platform';

/**
 * 設定の全体を表示へ適用する。差分は計算しない。
 *
 * 適用対象は少なく、差分を計算するほうがコストが高い。
 * 外部エディターでの編集も設定 UI の操作も、すべてこの経路を通る。
 */
export function applyAppearance(values: Settings): void {
  const root = document.documentElement;

  applyTheme(root, values.theme);
  // 配色（F-CONF-08 / ADR-0013）。面ごとに、面そのものへ属性を付与する。
  applyPalette(document.querySelector(PREVIEW_ROOT), values['preview.theme']);
  applyPalette(document.querySelector(EDITOR_ROOT), values['editor.theme']);

  // フォント名は既定のスタックの前に追加する（F-CONF-04）。
  // 置き換えると、そのフォントに含まれない文字（日本語 / 記号）のフォールバック先が失われる。
  const family = formatFontFamily(values['preview.fontFamily']);
  setVar(root, '--mx-font-content', family === null ? null : `${family}, var(--mx-font-content-stack)`);

  const codeFamily = formatFontFamily(values['preview.codeFontFamily']);
  setVar(root, '--mx-font-code', codeFamily === null ? null : `${codeFamily}, var(--mx-font-code-stack)`);

  setVar(root, '--mx-font-size-content', numeric(values, 'preview.fontSize', 'px'));
  setVar(root, '--mx-line-height', numeric(values, 'preview.lineHeight', ''));
  // 単位は `ch` にする。px にすると、文字サイズを変えたときに 1 行あたりの文字数が変わる（02.architecture/10-theming.md §2）。
  setVar(root, '--mx-content-width', numeric(values, 'preview.maxWidth', 'ch'));
}

/**
 * 配色の適用先（ADR-0013）。`index.html` にあり、起動時から存在する。
 * `null` になるのはテストの一部だけで、その場合は何もしない。
 */
const PREVIEW_ROOT = '#mx-preview';
const EDITOR_ROOT = '#mx-editor';

/**
 * 配色を当てる（F-CONF-08 / ADR-0013 / `styles/themes.css`）。
 *
 * `:root` には付けない。クロームの配色はテーマの選択では変えない。
 * 付与先は面そのもの（`#mx-preview` / `#mx-editor`）であり、カスタムプロパティの継承で配下へ伝わる。
 *
 * `default` のときは属性ごと削除する。
 * `applyTheme` が `system` で属性を削除するのと同じ理由で、設定を変更していない状態の DOM を M2 と同一に保つ（F-CONF-02）。
 */
function applyPalette(element: HTMLElement | null, palette: Palette): void {
  if (!element) return;
  if (palette === 'default') delete element.dataset['mxTheme'];
  else element.dataset['mxTheme'] = palette;
}

/**
 * 見本に着せる配色（`data-mx-theme` の値）。
 *
 * `default` のときは属性を付けない（`applyPalette` と同じ判断）。
 * 面ではなく設定ダイアログ内の見本に適用するため、DOM は変更せず値だけを返す。
 */
export function paletteAttr(palette: Palette): string | undefined {
  return palette === 'default' ? undefined : palette;
}

/**
 * テーマ（F-CONF-01）。
 *
 * `system` のときは属性ごと削除する。
 * `tokens.css` の `@media (prefers-color-scheme: dark)` が OS の設定を参照し、OS 側で切り替えられた時点で CSS だけで追従する。
 * JS のリスナーもポーリングも不要になる（N-PERF-05）。
 */
function applyTheme(root: HTMLElement, theme: Settings['theme']): void {
  if (theme === 'system') delete root.dataset['theme'];
  else root.dataset['theme'] = theme;
}

/**
 * 既定値と同じなら `null` を返す（トークン層の値をそのまま使う）。
 *
 * 既定値を書き込まないことが F-CONF-02 の担保になっている。
 */
function numeric(values: Settings, key: NumericKey, unit: string): string | null {
  const value = clampSetting(key, values[key]);
  if (value === DEFAULT_SETTINGS[key]) return null;
  return `${String(value)}${unit}`;
}

function setVar(root: HTMLElement, name: string, value: string | null): void {
  if (value === null) root.style.removeProperty(name);
  else root.style.setProperty(name, value);
}

/**
 * フォント名を CSS の `font-family` に入れられる形にする。
 *
 * ウェブフォントは読み込めない（CSP の `font-src 'self'` / 02.architecture/10-theming.md §3）。
 * ここに指定できるのは OS にインストールされているフォントのファミリ名だけで、見つからなければ後続のスタックにフォールバックする。
 *
 * すべて引用符で囲うのは、`Meiryo UI` のような空白を含む名前と `MS UI Gothic` のような数字で始まる名前を同じ扱いにするためである。
 * 囲えない文字（引用符・バックスラッシュ・`;` `{` `}` `(` `)`）を含むものは除外する。
 * 設定ファイルは手で編集できるため、ここに渡る文字列は検証されていない。
 * 影響が宣言 1 つに留まるとしても、通す理由がない。
 */
export function formatFontFamily(input: string): string | null {
  const families = input
    .split(',')
    .map((name) =>
      name
        .trim()
        .replace(/^["'](.*)["']$/u, '$1')
        .trim(),
    )
    .filter((name) => name.length > 0 && !/["'\\;{}()]/u.test(name));

  if (families.length === 0) return null;
  return families.map((name) => JSON.stringify(name)).join(', ');
}
