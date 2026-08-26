/**
 * カスタム CSS の適用（F-CONF-07 / 02.architecture.md §10.3 / ADR-0006）。
 *
 * # このファイルだけが `main` に載る
 *
 * カスタム CSS の残り（遅延取得・監視・通知）は `custom-css-late.ts` にあり、
 * `ready()` の後に動的 import される遅延チャンクである
 * （06.roadmap.md §5.3「カスタム CSS が遅延チャンクに載っている」）。
 *
 * **ここだけが例外で `main` に残る。** 64KB 以下のカスタム CSS は bootstrap に
 * 同梱されて届き（§10.3）、**本文を描くより前に**当てなければならない。
 * 後から当てると、ダークな背景を指定している人の画面で白い初期画面が一瞬見える。
 * `applyAppearance` がクリティカルパスに残っているのと同じ理由・同じ扱いで、
 * やることも「`<style>` を 1 枚差し替える」ことに尽きる。
 *
 * # 中身は検証しない。ただし閉じ込めは保証する
 *
 * CSS サニタイザは置かない（ADR-0006「議論: カスタム CSS は信頼境界のどちら側か」）。
 * ユーザーが自分でアプリデータ領域に置いたファイルであり、ここに検証を足すと
 * 壊れるのは正当なテーマのほうになる。
 *
 * **保証するのは適用範囲だけ。** `@scope (#mx-preview)` で包むことにより、
 * クロームの偽装・隠蔽（ダーティ表示やウィンドウ操作ボタンを消す）が
 * 原理的に起きないようにする。
 *
 * # 素朴な文字列連結では包めない
 *
 * ```css
 * @scope (#mx-preview) {
 * h1 { color: red }
 * }
 * .mx-titlebar { display: none }   ← ここはもうスコープの外
 * }
 * ```
 *
 * ユーザーの CSS が `}` でブロックを閉じてしまうと、以降はトップレベルの規則になる。
 * 波かっこを自前で数えて防ごうとすると、文字列・コメント・`url()`・エスケープ・
 * 「改行で終端する壊れた文字列」まで CSS の字句解析をやり直すことになり、
 * **1 か所でも取り違えると閉じ込めが破れる。**
 *
 * そこで**数えない**。包んだテキストをブラウザ自身の CSS パーサに食わせ、
 * 出来上がったスタイルシートが
 * 「**`@scope (#mx-preview)` ただ 1 つの規則**」になっていることを確かめる。
 * 1 つでも外に出た規則があれば `cssRules` の数が増えるので、判定は数え方に依存しない。
 * 外に出た規則が 1 つでもあれば**丸ごと適用しない**（部分適用は、
 * どこまで効いたのかがユーザーに見えない）。
 */

/** 本文の受け皿。`index.html` にあり、コンポーネントツリーの外にある（ADR-0005）。 */
const SCOPE_ROOT = '#mx-preview';

/** 包んだ後の前置き。判定でも使うので、組み立てと同じ文字列を 1 か所に置く。 */
const SCOPE_PRELUDE = `@scope (${SCOPE_ROOT})`;

const STYLE_ID = 'mx-custom-css';

/**
 * 適用の結果。
 *
 * `rejected` は**通知が要る**唯一の値。ユーザーは書いた CSS が効かない理由を
 * 知る必要があり、黙って落とすと「カスタム CSS が動かない」としか見えない。
 */
export type CustomCssResult = 'applied' | 'empty' | 'rejected';

/**
 * カスタム CSS を本文に適用する。`null` / 空文字は「無い」（＝当てていたものを外す）。
 *
 * **同期的に完了する。** bootstrap 経路では本文を描く前に呼ばれるため、
 * ここで待つものがあってはいけない。
 */
export function applyCustomCss(css: string | null): CustomCssResult {
  const style = styleElement();

  if (css === null || css.trim() === '') {
    style.textContent = '';
    return 'empty';
  }

  style.textContent = `${SCOPE_PRELUDE} {\n${css}\n}\n`;

  if (contained(style.sheet)) return 'applied';

  // 包めなかったものは**残さない**。直前のカスタム CSS を残す手もあるが、
  // 画面に出ているものとファイルの中身が食い違ったままになる。
  // 通知バーには「適用していない」と出るので、見えている状態と一致させる。
  style.textContent = '';
  return 'rejected';
}

/**
 * `<style>` を 1 枚だけ持ち回る。
 *
 * 差し替えのたびに作り直すと、外したときと足したときで 2 回スタイルが再計算される。
 * **`<head>` の末尾**に置くのは、既定スタイル（`tokens.css` / `preview.css`）の
 * 後に来ることを分かりやすくするため。もっとも `@scope` された規則は
 * スコープ近接（CSS Cascade 6）でスコープ外の規則に優先するので、
 * `h1 { … }` のような素のセレクタでも `.mx-preview h1 { … }` に負けない。
 * ユーザーがプレーンなセレクタのまま書ける（§10.3）のはこの性質による。
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
 * 本文の中に閉じ込められているか。**ここが Phase 5 の要**。
 *
 * ブラウザがどう解釈したかだけを見る。「1 つの `@scope` 規則しか無い」なら、
 * どんな書き方をされていても外へは出ていない。
 *
 * `null` / 0 個 / 2 個以上はすべて拒否になる。`@scope` を解釈できない WebView では
 * 包んだ規則ごと落ちて 0 個になるが、**それでよい**。閉じ込められない CSS を
 * 当てるくらいなら当てないほうが安全側に倒れている（ADR-0006）。
 */
function contained(sheet: CSSStyleSheet | null): boolean {
  if (!sheet) return false;

  let rules: CSSRuleList;
  try {
    rules = sheet.cssRules;
  } catch {
    // 同一オリジンのはずだが、読めないなら「確かめられなかった」＝拒否。
    return false;
  }

  if (rules.length !== 1) return false;

  const rule = rules[0];
  if (!rule) return false;
  // `CSSScopeRule` が無い環境では `instanceof` が投げるので、存在を先に見る。
  if (typeof CSSScopeRule !== 'function' || !(rule instanceof CSSScopeRule)) return false;

  // スコープの根が `#mx-preview` のままであること。ここを見ないと、
  // 「`@scope` 規則ではあるが根が違う」ものを通してしまう。
  return rule.cssText.startsWith(SCOPE_PRELUDE);
}
