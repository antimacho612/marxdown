// @vitest-environment jsdom
// CSS のパースそのものを見張るテストなので、実物の CSSOM が要る。
import { beforeEach, describe, expect, it } from 'vitest';

import { applyCustomCss } from './custom-css';

/**
 * クロームとして見張る要素。実物と同じクラス名にしてあるのは、
 * **カスタム CSS がこれを消せないこと**が 06.roadmap/m1.5-shell-and-settings.md §3 の完了条件だから。
 */
const CHROME = 'mx-titlebar';

function injected(): HTMLStyleElement | null {
  return document.querySelector<HTMLStyleElement>('style#mx-custom-css');
}

function rulesOf(style: HTMLStyleElement | null): CSSRule[] {
  return style?.sheet ? [...style.sheet.cssRules] : [];
}

function chromeDisplay(): string {
  const el = document.querySelector<HTMLElement>(`.${CHROME}`);
  return globalThis.getComputedStyle(el as HTMLElement).display;
}

beforeEach(() => {
  document.head.replaceChildren();
  document.body.replaceChildren();

  const titlebar = document.createElement('header');
  titlebar.className = CHROME;
  const preview = document.createElement('div');
  preview.id = 'mx-preview';
  preview.append(document.createElement('h1'));
  const editor = document.createElement('div');
  editor.id = 'mx-editor';
  document.body.append(titlebar, preview, editor);
});

describe('カスタム CSS の適用 (02.architecture/10-theming.md §3)', () => {
  it('ファイルが無いのは正常。何も注入しない', () => {
    expect(applyCustomCss(null)).toBe('empty');
    expect(rulesOf(injected())).toHaveLength(0);
  });

  it('空白だけの CSS も「無い」と同じ扱い', () => {
    expect(applyCustomCss('   \n\t  ')).toBe('empty');
    expect(rulesOf(injected())).toHaveLength(0);
  });

  /** 02.architecture/10-theming.md §3「ユーザーはプレーンなセレクタのまま書ける」。 */
  it('@scope (#mx-preview) で包んで注入する', () => {
    expect(applyCustomCss('h1 { color: red }')).toBe('applied');

    const rules = rulesOf(injected());
    expect(rules).toHaveLength(1);
    expect(rules[0]?.cssText).toContain('@scope (#mx-preview)');
    expect(rules[0]?.cssText).toContain('color: red');
  });

  it('変数の上書き（:scope）も同じ 1 枚に収まる', () => {
    expect(applyCustomCss(':scope { --mx-content-width: 90ch }')).toBe('applied');

    const rules = rulesOf(injected());
    expect(rules).toHaveLength(1);
    expect(rules[0]?.cssText).toContain('--mx-content-width');
  });

  it('注入する <style> は 1 枚だけ。当て直しても増えない', () => {
    applyCustomCss('h1 { color: red }');
    applyCustomCss('h1 { color: blue }');

    expect(document.querySelectorAll('style#mx-custom-css')).toHaveLength(1);
    expect(injected()?.textContent).toContain('blue');
  });

  it('消えたら外す（custom.css を消すのが「やめる」操作）', () => {
    applyCustomCss('h1 { color: red }');
    expect(applyCustomCss(null)).toBe('empty');

    expect(rulesOf(injected())).toHaveLength(0);
  });
});

/**
 * **ここがカスタム CSS の要。06.roadmap/m1.5-shell-and-settings.md §3「カスタム CSS でクロームの要素を消せないこと」。**
 *
 * 素朴に `@scope (…) { ユーザーの CSS }` と連結すると、ユーザーが `}` で
 * ブロックを閉じた時点で以降がスコープの外に出る。ここではその CSS を実際に食わせ、
 * **クロームが消えないこと**を計算済みスタイルで確かめる。
 */
describe('クロームの隠蔽を防ぐ (06.roadmap/m1.5-shell-and-settings.md §3)', () => {
  /** ブロックを閉じて外へ出ようとする CSS。`custom.css` にこれを書ける。 */
  const ESCAPING = `h1 { color: red }
}
.${CHROME} { display: none }
`;

  /** 素朴な連結が本当に破れることを先に示す。**これが防ぎたい事故そのもの。** */
  it('素朴な文字列連結だと、クロームが消える（対照）', () => {
    const naive = document.createElement('style');
    naive.textContent = `@scope (#mx-preview) {\n${ESCAPING}\n}\n`;
    document.head.append(naive);

    expect(chromeDisplay()).toBe('none');
    naive.remove();
  });

  it('閉じ過ぎた CSS は適用を拒否する。クロームは消えない', () => {
    expect(applyCustomCss(ESCAPING)).toBe('rejected');

    expect(chromeDisplay()).not.toBe('none');
    expect(rulesOf(injected())).toHaveLength(0);
    expect(injected()?.textContent).toBe('');
  });

  it('拒否は全体に効く。「途中まで当たる」状態を残さない', () => {
    applyCustomCss('h1 { color: red }');
    expect(rulesOf(injected())).toHaveLength(1);

    // 直前に当たっていたものごと外す。画面とファイルの中身を食い違わせない。
    expect(applyCustomCss(ESCAPING)).toBe('rejected');
    expect(rulesOf(injected())).toHaveLength(0);
  });

  /** `@media` などでくるんでも、外に出た規則は 1 つでも拒否になる。 */
  it('閉じた後に at-rule を置く書き方も拒否する', () => {
    const css = `h1 { color: red }
}
@media screen {
  .${CHROME} { display: none }
}
`;

    expect(applyCustomCss(css)).toBe('rejected');
    expect(chromeDisplay()).not.toBe('none');
  });

  /** 最初の 1 文字目から閉じにいく形。 */
  it('いきなり } で始まる CSS も拒否する', () => {
    expect(applyCustomCss(`}\n.${CHROME} { display: none }\n`)).toBe('rejected');
    expect(chromeDisplay()).not.toBe('none');
  });

  /**
   * **クローム側のセレクタを書くこと自体は禁じていない**（中身は検証しない /
   * ADR-0006）。閉じ込められている限り、書いても当たらないだけで済む。
   */
  it('スコープ内にクロームのセレクタを書いても、当たらないので消えない', () => {
    expect(applyCustomCss(`.${CHROME} { display: none }`)).toBe('applied');

    expect(chromeDisplay()).not.toBe('none');
    expect(rulesOf(injected())).toHaveLength(1);
  });
});

/**
 * エディタ用のカスタム CSS（ADR-0013）。
 *
 * **閉じ込めの仕組みは本文と 1 つ**で、変わるのは `@scope` の根と `<style>` の id だけ。
 * ここで見るのは「面を取り違えていないこと」に尽きる。
 */
describe('エディタ用カスタム CSS (ADR-0013)', () => {
  function injectedEditor(): HTMLStyleElement | null {
    return document.querySelector<HTMLStyleElement>('style#mx-editor-css');
  }

  it('本文とは別の <style> に、別の根で包まれる', () => {
    expect(applyCustomCss(':scope { --mx-color-bg: #1a1b26 }', 'editor')).toBe('applied');

    expect(injected(), '本文側は触らない').toBeNull();
    const rules = rulesOf(injectedEditor());
    expect(rules).toHaveLength(1);
    expect(rules[0]?.cssText.startsWith('@scope (#mx-editor)')).toBe(true);
  });

  it('2 つの面は同時に当たり、互いを消さない', () => {
    expect(applyCustomCss('h1 { color: red }')).toBe('applied');
    expect(applyCustomCss(':scope { --mx-color-fg: #fff }', 'editor')).toBe('applied');

    expect(rulesOf(injected())).toHaveLength(1);
    expect(rulesOf(injectedEditor())).toHaveLength(1);
  });

  /**
   * **エディタ側でも閉じ込めが破れないこと。** 本文用と同じ判定を通っているが、
   * 根を引数で渡すようになったぶん、取り違えると片方だけ素通りしうる。
   */
  it('スコープの外へ出る CSS は、エディタ側でも丸ごと拒否する', () => {
    const escaping = 'h1 { color: red }\n}\n.mx-titlebar { display: none }';

    expect(applyCustomCss(escaping, 'editor')).toBe('rejected');
    expect(injectedEditor()?.textContent).toBe('');
    expect(chromeDisplay()).not.toBe('none');
  });
});
