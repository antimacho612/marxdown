// @vitest-environment jsdom
/**
 * 数式の描画（F-VIEW-13）。
 *
 * 中心ユースケースが「LLM が生成した、自分が書いていないファイルを開く」である以上、
 * ここも**攻撃者が書いた TeX**を前提に書く（`markdown/sanitize.dom.test.ts` と同じ立場）。
 */
import { describe, expect, it } from 'vitest';

import { renderMath } from './math';

/** プレースホルダを 1 つ作る。中身は `markdown/plugins/math.ts` が出す形と同じ。 */
function placeholder(source: string, mode: 'inline' | 'inline-display' | 'block' = 'inline'): HTMLElement {
  const element = document.createElement(mode === 'block' ? 'div' : 'span');
  element.className = 'mx-math';
  element.dataset['mxMath'] = mode;
  element.textContent = source;
  return element;
}

describe('描画', () => {
  it('プレースホルダを KaTeX の出力へ置き換える', () => {
    const element = placeholder('E = mc^2');
    renderMath(element);

    expect(element.querySelector('.katex')).not.toBeNull();
    expect(element.dataset['mxMathRendered']).toBe('');
  });

  it('ブロックは displayMode で描く', () => {
    const element = placeholder('a = b', 'block');
    renderMath(element);

    expect(element.querySelector('.katex-display')).not.toBeNull();
  });

  it('インラインは displayMode にしない', () => {
    const element = placeholder('a = b');
    renderMath(element);

    expect(element.querySelector('.katex-display')).toBeNull();
  });

  it('支援技術が読む MathML を残す', () => {
    // `sanitizeMath` が mathMl プロファイルを持たないと、ここが丸ごと落ちる。
    const element = placeholder('x + y');
    renderMath(element);

    expect(element.querySelector('math')).not.toBeNull();
  });

  it('字の位置を決める style 属性を残す', () => {
    // 本文用の設定は style を落とすが、それを数式へ適用すると縦に潰れて読めなくなる。
    const element = placeholder(String.raw`\frac{1}{2}`, 'block');
    renderMath(element);

    expect(element.querySelector('[style]')).not.toBeNull();
  });

  it('空のプレースホルダには何もしない', () => {
    const element = placeholder('');
    renderMath(element);

    expect(element.dataset['mxMathRendered']).toBeUndefined();
  });
});

describe('信頼できない TeX', () => {
  it('壊れた記法でも例外を投げず、要素を残す', () => {
    const element = placeholder(String.raw`\frac{1}{`);
    expect(() => renderMath(element)).not.toThrow();
    // 空欄にはしない。描けなくても TeX が読める状態で残るほうが情報が多い（N-REL-04）。
    expect(element.textContent).not.toBe('');
  });

  it('\\href でリンクを本文へ持ち込めない', () => {
    // `trust: false` の効果。有効だと数式からリンクを生成できてしまう。
    const element = placeholder(String.raw`\href{javascript:alert(1)}{click}`);
    renderMath(element);

    expect(element.querySelector('a')).toBeNull();
  });

  it('script を含む TeX から script 要素が生まれない', () => {
    const element = placeholder(String.raw`\text{<script>alert(1)</script>}`);
    renderMath(element);

    expect(element.querySelector('script')).toBeNull();
  });
});
