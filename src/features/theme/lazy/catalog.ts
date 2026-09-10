/**
 * エディターの配色の一覧と適用（ADR-0014 / `theme` チャンク）。
 *
 * 組み込みの 50 枚（`presets.ts`）とユーザーが `themes/` に置いたファイルを 1 つのカタログとして扱い、選ばれている 1 枚だけを `<style>` に注入する。
 * 50 枚ぶんの CSS を常に流し込んでいるわけではない。
 *
 * このチャンクを読み込むのはエディターを開いたときと設定ダイアログを開いたときだけである。
 * 既定の表示モードは Preview で、`#mx-editor` は Monaco がマウントされるまで空であるため、ここが遅れて読み込まれても未適用の配色が一瞬見えることはない。
 * 組み込み配色をクリティカルパスから外せる根拠がこれで、プレビュー側（`styles/themes.css`）とは事情が違う。
 *
 * 注入の封じ込めは `features/settings/custom-css.ts` と同じ考え方で、波かっこを自前で数えずブラウザの CSS パーサへ渡し、生成された規則が想定した 1 つだけかで判定する。
 * ユーザーが置いたファイルの中身は検証しない（ADR-0006）。保証するのは適用範囲だけである。
 */
import { getPlatform, type UserTheme } from '@/platform';

import { declarations, type Preset, type ThemeSummary } from './preset';
import { PRESETS } from './presets';

/**
 * 配色を選ぶための属性。プレビューの `data-mx-theme` とは分けてある。
 *
 * カタログが別なのに id は重なる（`github` / `solarized` など）。
 * 同じ属性名を使うと、ここで注入した規則が `#mx-preview` にも一致してしまう。
 */
const ATTRIBUTE = 'data-mx-editor-theme';

const STYLE_ID = 'mx-editor-theme';

/** 配色を選んでいない状態。属性を付けず、`tokens.css` のトークンをそのまま使う（F-CONF-02）。 */
const DEFAULT_ID = 'default';

/**
 * `themes/` から読み込んだもの。id で引く。
 *
 * 起動のたびに読み直すため永続化はしない。
 * 空のままでも組み込みの 50 枚は選べる（Tauri の外で動かす `pnpm dev:web` がその状態にあたる）。
 */
const userThemes = new Map<string, UserTheme>();

/** 配色の適用結果。通知が必要になるのは `rejected` だけである。 */
export type ApplyResult = 'applied' | 'default' | 'unknown' | 'rejected';

/**
 * `themes/` を読み直す。ファイルが 1 枚も無い状態は正常であり、失敗として扱わない。
 *
 * 適用し直しは行わない。呼び出し側が続けて `applyTheme` を呼ぶ。
 * 読み直しと適用を 1 つにすると、起動直後（まだ何も適用していない）と外部変更（適用中のものがある）で別の関数が要る形になる。
 */
export async function refreshUserThemes(): Promise<void> {
  let loaded: readonly UserTheme[];
  try {
    loaded = await getPlatform().listUserThemes();
  } catch {
    // 読めなかったことは通知しない。組み込みの配色は選べるままである。
    return;
  }

  userThemes.clear();
  for (const theme of loaded) userThemes.set(theme.id, theme);
}

/**
 * 選択の一覧。色は含まない（`ThemeSummary`）。
 *
 * 同じ id が両方にあればユーザー側を採る。
 * 組み込みの配色を自分の好みへ差し替える手段がこれで、設定を書き換えずに済む。
 */
export function listThemes(): ThemeSummary[] {
  const summaries: ThemeSummary[] = [];

  for (const [id, theme] of userThemes) {
    summaries.push(summary(id, id, schemeOf(theme.declarations), true));
  }
  for (const [id, preset] of Object.entries(PRESETS) as [string, Preset][]) {
    if (userThemes.has(id)) continue;
    summaries.push(summary(id, preset.label, preset.scheme, false));
  }

  return summaries;
}

/**
 * 1 件ぶんの要約。
 *
 * 明暗を持たない配色では `scheme` のキーごと落とす。
 * `exactOptionalPropertyTypes` の下では `scheme: undefined` を書くこと自体が型エラーになる。
 */
function summary(id: string, label: string, scheme: 'light' | 'dark' | undefined, user: boolean): ThemeSummary {
  return scheme === undefined ? { id, label, user } : { id, label, scheme, user };
}

/**
 * 選ばれている配色を面に効かせる。同期的に完了する。
 *
 * 属性そのものを付けるのは `features/settings/appearance.ts` で、ここは属性に意味を与える規則を用意するだけである。
 * 分かれているのは、属性が起動直後（`main`）に付き、規則はこのチャンクが読み込まれるまで存在しないためである。
 *
 * 知らない id は既定へ落とさず、何も注入せずに `unknown` を返す。
 * 落としてしまうと、テーマファイルの名前を打ち間違えたのか、そもそも適用されていないのかをユーザーが区別できない。
 */
export function applyTheme(id: string): ApplyResult {
  const style = styleElement();

  if (id === DEFAULT_ID) {
    style.textContent = '';
    return 'default';
  }

  const body = bodyOf(id);
  if (body === null) {
    style.textContent = '';
    return 'unknown';
  }

  style.textContent = `[${ATTRIBUTE}='${id}'] {\n${body}\n}\n`;

  if (contained(style.sheet, id)) return 'applied';

  // 適用範囲を保証できなかったものは残さない（`applyCustomCss` と同じ判断）。
  style.textContent = '';
  return 'rejected';
}

/** 宣言の並び。ユーザーのファイルを組み込みより先に見る。 */
function bodyOf(id: string): string | null {
  const user = userThemes.get(id);
  if (user) return user.declarations;

  const preset = (PRESETS as Record<string, Preset>)[id];
  return preset ? declarations(preset) : null;
}

/**
 * 明暗の別。一覧の並べ替えにだけ使う。
 *
 * 実際の挙動を決めるのは注入された CSS そのものであり、この判定ではない。
 * そのため、宣言の文字列を見るだけの雑な判定で足りる。
 */
function schemeOf(text: string): 'light' | 'dark' | undefined {
  const found = /color-scheme\s*:\s*(light|dark)\b/iu.exec(text);
  return found ? (found[1]?.toLowerCase() as 'light' | 'dark') : undefined;
}

/**
 * `<style>` を 1 枚だけ持ち回る。
 *
 * `<head>` の末尾に置く。
 * ユーザーのカスタム CSS（`preview.css`）は `@scope` で書かれており、スコープ近接（CSS Cascade 6）によってここより優先される。
 * 配色を選んだうえで一部だけ上書きする、という重ね順が `!important` 無しで成立する（ADR-0013 §3.6）。
 */
function styleElement(): HTMLStyleElement {
  const existing = document.querySelector<HTMLStyleElement>(`style#${STYLE_ID}`);
  if (existing) return existing;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  document.head.append(style);
  return style;
}

/**
 * 注入した内容が、意図した 1 つの規則に収まっているか。
 *
 * ユーザーのファイルが波かっこを余分に閉じていれば、後ろに書いたものが面の外へ出る。
 * それを字句解析で見つけようとすると CSS のパーサを再実装することになるため、ブラウザに解釈させた結果だけを見る。
 * 規則が 1 つで、そのセレクタが組み立てたものと一致していれば、どのような記述であっても外へは出ていない。
 *
 * セレクタの引用符はブラウザが `"` へ正規化するため、比較の前に揃える。
 */
function contained(sheet: CSSStyleSheet | null, id: string): boolean {
  if (!sheet) return false;

  let rules: CSSRuleList;
  try {
    rules = sheet.cssRules;
  } catch {
    return false;
  }

  if (rules.length !== 1) return false;

  const rule = rules[0];
  if (!(rule instanceof CSSStyleRule)) return false;

  return rule.selectorText.replaceAll('"', "'") === `[${ATTRIBUTE}='${id}']`;
}
