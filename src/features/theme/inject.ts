/**
 * 配色 1 枚を面へ注入する（ADR-0014 / `main`）。
 *
 * 面ごとに `<style>` を 1 枚だけ持ち、選ばれている 1 枚だけを流し込む。
 * 組み込みの 50 枚を持っているのは遅延チャンク（`lazy/catalog.ts`）で、ここにあるのは注入と封じ込めの判定だけである。
 *
 * ここが `main` に残るのは、`themes/` に置かれた配色をプレビューへ適用する経路がカタログを経由しないためである。
 * 選ばれている 1 枚の宣言は bootstrap に同梱されて届き（`Bootstrap.previewTheme`）、本文を描画するより前に適用する必要がある。
 * チャンクの取得を待つと、暗い配色を選んでいる人の初回フレームが既定の配色で描かれる。
 *
 * 封じ込めの判定では波かっこを自前で数えない。
 * セレクタで包んでブラウザの CSS パーサへ渡し、生成された規則が想定した 1 つだけかで判定する。
 * ユーザーが置いたファイルの中身は検証しない（ADR-0006）。保証するのは適用範囲だけである。
 */

/** 配色を選べる面。カタログは共通で、面ごとに独立して選べる。 */
export type Surface = 'preview' | 'editor';

/**
 * 面を選ぶ属性。カタログが同じでも属性は分ける（ADR-0014 §3.3）。
 *
 * 同じ属性名にすると、エディター用に注入した `github` の規則が `#mx-preview` にも一致する。
 * 面ごとに別の配色を選べる以上、両方に適用されてはいけない。
 */
const ATTRIBUTES: Record<Surface, string> = {
  preview: 'data-mx-theme',
  editor: 'data-mx-editor-theme',
};

const STYLE_IDS: Record<Surface, string> = {
  preview: 'mx-preview-theme',
  editor: 'mx-editor-theme',
};

/** 配色の適用結果。通知が必要になるのは `unknown` と `rejected` だけである。 */
export type ApplyResult = 'applied' | 'default' | 'unknown' | 'rejected';

/**
 * 宣言の並びを面へ注入する。同期的に完了する。
 *
 * `declarations` はセレクタを含まない。
 * 包んだ結果が面の外へ出ていれば何も残さず `rejected` を返す。
 */
export function injectTheme(surface: Surface, id: string, declarations: string): ApplyResult {
  const style = styleElement(surface);
  const selector = `[${ATTRIBUTES[surface]}='${id}']`;

  style.textContent = `${selector} {\n${declarations}\n}\n`;
  if (contained(style.sheet, selector)) return 'applied';

  // 適用範囲を保証できなかったものは残さない。
  // 部分的に適用された状態にすると、どこまでが適用されているのかを画面から読み取れない。
  style.textContent = '';
  return 'rejected';
}

/** 面に適用しているものを外す。`default` と、カタログに無い id のどちらもここを通る。 */
export function clearTheme(surface: Surface): void {
  styleElement(surface).textContent = '';
}

/**
 * `<style>` を面ごとに 1 枚だけ持ち回る。
 *
 * `<head>` の末尾に置く。
 * `tokens.css` より後に来ることを明示するためで、順序はカスケードの前提になっている（ADR-0013 §3.6）。
 */
function styleElement(surface: Surface): HTMLStyleElement {
  const id = STYLE_IDS[surface];
  const existing = document.querySelector<HTMLStyleElement>(`style#${id}`);
  if (existing) return existing;

  const style = document.createElement('style');
  style.id = id;
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
function contained(sheet: CSSStyleSheet | null, selector: string): boolean {
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

  return rule.selectorText.replaceAll('"', "'") === selector;
}
