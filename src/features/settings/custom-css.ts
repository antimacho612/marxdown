/**
 * カスタム CSS の適用（F-CONF-07 / 02.architecture/10-theming.md §3 / ADR-0006 / ADR-0013）。
 *
 * 当てる面は 2 つ（本文 `preview.css` / エディター `editor.css`）だが閉じ込めの仕組みは 1 つで根が違うだけである。
 * 遅延取得・監視・通知は `custom-css-late.ts` にあるが、ここだけは `main` に残る。
 * 64KB 以下は bootstrap に同梱され、本文を描く前に当てないと FOUC になるためである。
 *
 * CSS サニタイザは置かない（ADR-0006。ユーザー自身が置いたファイルであり、検証を足すと壊れるのは正当なテーマのほう）。
 * 保証するのは適用範囲だけで、`@scope (#mx-preview)` で包んでクロームの偽装・隠蔽を防ぐ。
 *
 * 波かっこを自前で数えて閉じ込めを守ろうとすると CSS の字句解析をやり直すことになり取り違えのリスクが残る。
 * そのため数えずにブラウザの CSS パーサへ食わせ、出来上がったスタイルシートが `@scope (#mx-preview)` ただ 1 つの規則になっているかで判定する。
 * 1 つでも外に出ていれば丸ごと適用しない（部分適用は効果範囲が見えなくなる）。
 */
import { bumpStyleEpoch } from './style-epoch.svelte';

/**
 * カスタム CSS が当たる面（ADR-0013 / `src-tauri/src/custom_css.rs` の `Surface`）。
 *
 * **どちらも `index.html` にあり、コンポーネントツリーの外にある**（ADR-0005）。
 * 面が 2 つになっても仕組みは 1 つのままで、変わるのは
 * 「`@scope` の根」と「どの `<style>` に入れるか」だけである。
 */
export type CssSurface = 'preview' | 'editor';

const SURFACES = {
  preview: { root: '#mx-preview', styleId: 'mx-custom-css' },
  editor: { root: '#mx-editor', styleId: 'mx-editor-css' },
} as const;

/** 包んだ後の前置き。判定でも使うので、組み立てと同じ文字列を 1 か所に置く。 */
function prelude(surface: CssSurface): string {
  return `@scope (${SURFACES[surface].root})`;
}

/**
 * 適用の結果。
 *
 * `rejected` は**通知が要る**唯一の値。ユーザーは書いた CSS が効かない理由を
 * 知る必要があり、黙って落とすと「カスタム CSS が動かない」としか見えない。
 */
export type CustomCssResult = 'applied' | 'empty' | 'rejected';

/**
 * カスタム CSS を面に適用する。`null` / 空文字は「無い」（＝当てていたものを外す）。
 *
 * **同期的に完了する。** bootstrap 経路では本文を描く前に呼ばれるため、
 * ここで待つものがあってはいけない。
 */
export function applyCustomCss(css: string | null, surface: CssSurface = 'preview'): CustomCssResult {
  const style = styleElement(surface);
  // **エディター側だけ合図を出す。** Monaco はトークンを JS で読み出しており、
  // `<style>` が増えたことに自分では気づけない（`style-epoch.svelte.ts`）。
  // 本文側は CSS がそのまま効くので、知らせる相手がいない。
  if (surface === 'editor') bumpStyleEpoch();

  if (css === null || css.trim() === '') {
    style.textContent = '';
    return 'empty';
  }

  style.textContent = `${prelude(surface)} {\n${css}\n}\n`;

  if (contained(style.sheet, surface)) return 'applied';

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
 * ユーザーがプレーンなセレクタのまま書ける（§3）のはこの性質による。
 */
function styleElement(surface: CssSurface): HTMLStyleElement {
  const id = SURFACES[surface].styleId;
  const existing = document.querySelector<HTMLStyleElement>(`style#${id}`);
  if (existing) return existing;

  const style = document.createElement('style');
  style.id = id;
  document.head.append(style);
  return style;
}

/**
 * 本文の中に閉じ込められているか。**ここがカスタム CSS の要**。
 *
 * ブラウザがどう解釈したかだけを見る。「1 つの `@scope` 規則しか無い」なら、
 * どんな書き方をされていても外へは出ていない。
 *
 * `null` / 0 個 / 2 個以上はすべて拒否になる。`@scope` を解釈できない WebView では
 * 包んだ規則ごと落ちて 0 個になるが、**それでよい**。閉じ込められない CSS を
 * 当てるくらいなら当てないほうが安全側に倒れている（ADR-0006）。
 */
function contained(sheet: CSSStyleSheet | null, surface: CssSurface): boolean {
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

  // スコープの根が当てようとした面のままであること。ここを見ないと、
  // 「`@scope` 規則ではあるが根が違う」ものを通してしまう。
  return rule.cssText.startsWith(prelude(surface));
}
