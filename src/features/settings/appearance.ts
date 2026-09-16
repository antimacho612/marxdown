/**
 * 設定を見た目に当てる（F-CONF-01 / F-CONF-04 / 02.architecture/10-theming.md §1）。
 *
 * 設定 UI は遅延チャンクだが、`main` にはこのファイルとストアだけが残り、`:root` のカスタムプロパティを書き換えるだけの仕事をする。
 * `bootstrap.ts` の `initSettings` から本文描画より前に同期的に呼ぶ（後から適用すると、一度描画された内容が別の見た目に再描画される）。
 * 既定値と同じなら `removeProperty` して `tokens.css` と二重管理にせず、未設定時の見た目を保つ（F-CONF-02）。
 * 適用先はすべてトークン層で、`themes/` に置いた配色からも同じ変数として見える。
 * CSS へ渡す値の整形は `format.ts` にある。見本（`lazy/samples/`）が同じ整形を使うためで、そちらから DOM 操作を引き込まないよう分けてある。
 */
import { applyPreviewTheme } from '@/features/theme';
import { clampSetting, DEFAULT_SETTINGS, type NumericKey, type Settings } from '@/platform';

import { formatFontFamily } from './format';

/**
 * 設定の全体を表示へ適用する。差分は計算しない。
 *
 * 適用対象は少なく、差分を計算するほうがコストが高い。
 * 外部エディターでの編集も設定 UI の操作も、すべてこの経路を通る。
 */
export function applyAppearance(values: Settings): void {
  const root = document.documentElement;

  applyTheme(root, values.theme);
  // 配色（F-CONF-08 / ADR-0013 / ADR-0014）。面ごとに、面そのものへ属性を付与する。
  applyPalette(document.querySelector(PREVIEW_ROOT), 'mxTheme', values['preview.theme']);
  applyPalette(document.querySelector(EDITOR_ROOT), 'mxEditorTheme', values['editor.theme']);

  // 属性に意味を与える規則を用意する。
  // プレビューは起動直後から見えている面であり、規則の用意までを設定の適用に含めないと、既定の配色で 1 フレーム描かれる。
  // エディター側は Monaco がマウントされたときに `features/editor/lazy/palette.ts` が行う。
  applyPreviewTheme(values['preview.theme']);

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
 * 配色を当てる（F-CONF-08 / ADR-0013 / ADR-0014）。
 *
 * `:root` には付けない。クロームの配色はテーマの選択では変えない。
 * 付与先は面そのもの（`#mx-preview` / `#mx-editor`）であり、カスタムプロパティの継承で配下へ伝わる。
 *
 * 属性名が面ごとに違うのは、カタログを分けたことで id が重複するためである（ADR-0014 §3.3）。
 * 同じ属性名にすると、エディター側の `github` を選んだときに注入した規則が `#mx-preview` にも一致する。
 *
 * ここで行うのは属性の付与だけである。
 * 規則の用意は面ごとに経路が違うため、呼び出し側が続けて行う。
 *
 * `default` のときは属性ごと削除する。
 * `applyTheme` が `system` で属性を削除するのと同じ理由で、設定を変更していない状態の DOM を M2 と同一に保つ（F-CONF-02）。
 */
function applyPalette(element: HTMLElement | null, attribute: 'mxTheme' | 'mxEditorTheme', palette: string): void {
  if (!element) return;
  if (palette === 'default') delete element.dataset[attribute];
  else element.dataset[attribute] = palette;
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
