/**
 * カスタム CSS の適用（F-CONF-07 / 02.architecture/10-theming.md §3 / ADR-0006）。
 *
 * 当てる面は本文（`preview.css`）だけである。
 * エディター用の `editor.css` は配色のカタログへ統合して廃止した（ADR-0014 §3.5）。
 * 遅延取得・監視・通知は `lazy/install-custom-css.ts` にあるが、ここだけは `main` に残る。
 * 64KB 以下は bootstrap に同梱され、本文を描く前に当てないと FOUC になるためである。
 *
 * CSS サニタイザは置かない（ADR-0006。ユーザー自身が置いたファイルであり、検証を足すと壊れるのは正当なテーマのほう）。
 * 保証するのは適用範囲だけで、`@scope (#mx-preview)` で包んでクロームの偽装・隠蔽を防ぐ。
 *
 * 波かっこを自前で数えて適用範囲を保証しようとすると CSS の字句解析を再実装することになり、判定を誤る余地が残る。
 * そのため数えずにブラウザの CSS パーサへ渡し、生成されたスタイルシートが `@scope (#mx-preview)` ただ 1 つの規則になっているかで判定する。
 * 1 つでも外に出ていれば丸ごと適用しない（部分適用は効果範囲が見えなくなる）。
 */

/**
 * 適用先。`index.html` にあり、コンポーネントツリーの外にある（ADR-0005）。
 */
const ROOT = '#mx-preview';

const STYLE_ID = 'mx-custom-css';

/** 包んだ後の前置き。判定でも使うため、組み立てと同じ文字列を 1 か所に置く。 */
const PRELUDE = `@scope (${ROOT})`;

/**
 * 適用の結果。
 *
 * 通知が必要になるのは `rejected` だけである。
 * 記述した CSS が適用されない理由を伝えないと、原因を特定できない。
 */
export type CustomCssResult = 'applied' | 'empty' | 'rejected';

/**
 * カスタム CSS を本文へ適用する。`null` / 空文字は「無い」（＝当てていたものを外す）。
 *
 * 同期的に完了する。
 * bootstrap 経路では本文を描画する前に呼ばれるため、ここで非同期の待機を挟んではいけない。
 */
export function applyCustomCss(css: string | null): CustomCssResult {
  const style = styleElement();

  if (css === null || css.trim() === '') {
    style.textContent = '';
    return 'empty';
  }

  style.textContent = `${PRELUDE} {\n${css}\n}\n`;

  if (contained(style.sheet)) return 'applied';

  // 適用範囲を保証できなかった内容は残さない。
  // 直前のカスタム CSS を残す方法もあるが、画面の表示とファイルの内容が食い違ったままになる。
  // 通知バーには適用していない旨を表示するため、表示と状態を一致させる。
  style.textContent = '';
  return 'rejected';
}

/**
 * `<style>` を 1 枚だけ持ち回る。
 *
 * 差し替えのたびに作り直すと、削除時と追加時の 2 回スタイルが再計算される。
 * `<head>` の末尾に置くのは、既定スタイル（`tokens.css` / `preview.css`）より後に来ることを明示するためである。
 * ただし `@scope` された規則はスコープ近接（CSS Cascade 6）によってスコープ外の規則より優先されるため、`h1 { … }` のような単純なセレクタでも `.mx-preview h1 { … }` に優先する。
 * ユーザーが単純なセレクタのまま記述できる（§3）のはこの性質による。
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
 * 適用範囲が本文の中に限定されているか。この判定がカスタム CSS の中核にあたる。
 *
 * 判断材料はブラウザの解釈結果だけである。
 * `@scope` 規則が 1 つだけであれば、どのような記述であっても適用範囲の外へは出ていない。
 *
 * `null`、0 個、2 個以上はすべて拒否する。
 * `@scope` を解釈できない WebView では包んだ規則ごと失われて 0 個になるが、その場合も拒否でよい。
 * 適用範囲を限定できない CSS を適用するより、適用しないほうが安全である（ADR-0006）。
 */
function contained(sheet: CSSStyleSheet | null): boolean {
  if (!sheet) return false;

  let rules: CSSRuleList;
  try {
    rules = sheet.cssRules;
  } catch {
    // 同一オリジンであるはずだが、読めない場合は検証できなかったものとして拒否する。
    return false;
  }

  if (rules.length !== 1) return false;

  const rule = rules[0];
  if (!rule) return false;
  // `CSSScopeRule` が存在しない環境では `instanceof` が例外を投げるため、先に存在を確認する。
  if (typeof CSSScopeRule !== 'function' || !(rule instanceof CSSScopeRule)) return false;

  // スコープの起点が適用対象の面と一致していること。
  // 確認しないと、`@scope` 規則ではあるが起点が異なるものを通してしまう。
  return rule.cssText.startsWith(PRELUDE);
}
