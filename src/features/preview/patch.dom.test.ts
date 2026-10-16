// @vitest-environment jsdom
/**
 * Split の再描画で変わったブロックだけを差し替えること（#159）。
 *
 * 作り直すと、段階的描画の途中でスクロール位置が切り詰められ、処理済みの要素の高さも変わってプレビューが動く。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { frontMatterCodeHtml } from '@/markdown/plugins/front-matter';

import { paint, patch } from './paint';

let el: HTMLElement;

beforeEach(() => {
  document.body.replaceChildren();
  vi.stubGlobal('requestIdleCallback', undefined);
  el = document.createElement('div');
  document.body.append(el);
});

/** `blocks` をすべて描画し終えた状態にする。 */
function painted(blocks: string[], frontMatter: string | null = null): void {
  paint(el, [blocks.join('')], frontMatter, blocks);
}

function tops(): Element[] {
  return [...(el.querySelector('.mx-content')?.children ?? [])];
}

describe('patch', () => {
  it('変わっていないブロックの要素はそのまま残す', () => {
    painted(['<p data-line="0">a</p>\n', '<p data-line="2">b</p>\n', '<p data-line="4">c</p>\n']);
    const [a, b, c] = tops();
    // 処理済みの印（`enhance`）も残ることの確認に使う。
    b?.setAttribute('data-mx-enhanced', '');

    const result = patch(
      el,
      ['<p data-line="0">a</p>\n', '<p data-line="2">b</p>\n', '<p data-line="4">C</p>\n'],
      null,
    );

    expect(result).toBe('patched');
    const [a2, b2, c2] = tops();
    expect(a2).toBe(a);
    expect(b2).toBe(b);
    expect(b2?.hasAttribute('data-mx-enhanced')).toBe(true);
    expect(c2).not.toBe(c);
    expect(c2?.textContent).toBe('C');
  });

  it('行番号だけが変わったブロックは data-line だけを書き換える', () => {
    painted(['<p data-line="0">a</p>\n', '<ul data-line="2">\n<li data-line="2">x</li>\n</ul>\n']);
    const [, list] = tops();

    patch(el, ['<p data-line="0">a\nb</p>\n', '<ul data-line="3">\n<li data-line="3">x</li>\n</ul>\n'], null);

    const [, list2] = tops();
    expect(list2).toBe(list);
    expect(list2?.getAttribute('data-line')).toBe('3');
    expect(list2?.querySelector('li')?.getAttribute('data-line')).toBe('3');
  });

  it('ブロックが増えても前後の要素は残し、正しい位置に入れる', () => {
    painted(['<p data-line="0">a</p>\n', '<p data-line="2">c</p>\n']);
    const [a, c] = tops();

    patch(el, ['<p data-line="0">a</p>\n', '<p data-line="2">b</p>\n', '<p data-line="4">c</p>\n'], null);

    const after = tops();
    expect(after.map((e) => e.textContent)).toEqual(['a', 'b', 'c']);
    expect(after[0]).toBe(a);
    expect(after[2]).toBe(c);
    expect(after[2]?.getAttribute('data-line')).toBe('4');
  });

  it('ブロックが減ったら取り除く', () => {
    painted(['<p data-line="0">a</p>\n', '<p data-line="2">b</p>\n', '<p data-line="4">c</p>\n']);

    patch(el, ['<p data-line="0">a</p>\n', '<p data-line="2">c</p>\n'], null);

    expect(tops().map((e) => e.textContent)).toEqual(['a', 'c']);
  });

  it('先頭が data-line を持たない生の HTML でも差分で反映する', () => {
    painted(['<div class="x">raw</div>\n', '<p data-line="2">b</p>\n']);
    const [raw] = tops();

    const result = patch(el, ['<div class="x">raw</div>\n', '<p data-line="2">B</p>\n'], null);

    expect(result).toBe('patched');
    expect(tops()[0]).toBe(raw);
    expect(tops().map((e) => e.textContent)).toEqual(['raw', 'B']);
  });

  it('Front Matter の変化を反映する', () => {
    painted(['<p data-line="3">a</p>\n'], frontMatterCodeHtml('title: x'));

    patch(el, ['<p data-line="3">a</p>\n'], frontMatterCodeHtml('title: y'));
    expect(el.querySelector('.mx-front-matter')?.textContent).toBe('title: y');

    patch(el, ['<p data-line="0">a</p>\n'], null);
    expect(el.querySelector('.mx-front-matter')).toBeNull();

    patch(el, ['<p data-line="3">a</p>\n'], frontMatterCodeHtml('title: z'));
    expect(el.firstElementChild?.className).toBe('mx-front-matter');
  });

  it('Front Matter が変わっていなければ要素を残す', () => {
    painted(['<p data-line="3">a</p>\n'], frontMatterCodeHtml('title: x'));
    const before = el.querySelector('.mx-front-matter');
    // ハイライトで中身が書き換わった状態でも、元の HTML で比べる。
    before?.querySelector('code')?.replaceChildren('highlighted');

    patch(el, ['<p data-line="3">b</p>\n'], frontMatterCodeHtml('title: x'));

    expect(el.querySelector('.mx-front-matter')).toBe(before);
  });

  it('Front Matter の見せ方が変わったら作り直す', () => {
    painted(['<p data-line="3">a</p>\n'], frontMatterCodeHtml('title: x'));

    patch(el, ['<p data-line="3">a</p>\n'], '<div class="mx-front-matter"><table></table></div>');

    expect(el.querySelectorAll('.mx-front-matter')).toHaveLength(1);
    expect(el.querySelector('.mx-front-matter table')).not.toBeNull();
  });

  it('サニタイズを通す', () => {
    painted(['<p data-line="0">a</p>\n']);

    patch(el, ['<p data-line="0">a<img src="x" onerror="alert(1)"></p>\n'], null);

    expect(el.querySelector('img')?.hasAttribute('onerror')).toBe(false);
  });

  describe('対応が取れないときは全体を同期的に描画し直す', () => {
    it('blocks を渡さずに描画していた', () => {
      paint(el, ['<p data-line="0">a</p>\n']);

      expect(patch(el, ['<p data-line="0">b</p>\n'], null)).toBe('repainted');
      expect(tops().map((e) => e.textContent)).toEqual(['b']);
    });

    it('段階的描画の途中だった', () => {
      paint(el, ['<p data-line="0">a</p>\n', '<p data-line="2">b</p>\n'], null, [
        '<p data-line="0">a</p>\n',
        '<p data-line="2">b</p>\n',
      ]);

      expect(patch(el, ['<p data-line="0">a</p>\n', '<p data-line="2">B</p>\n'], null)).toBe('repainted');
      // 残りを待たずにすべて入っている。
      expect(tops().map((e) => e.textContent)).toEqual(['a', 'B']);
    });

    it('差し替える部分だけをパースすると要素の構造が変わる', () => {
      painted(['<p data-line="0">a</p>\n', '<p data-line="2">b</p>\n']);

      // 閉じていない `<div>` が後続のブロックを取り込み、トップレベルの要素の数が合わなくなる。
      const result = patch(el, ['<p data-line="0">A</p>\n<div>\n', '<p data-line="2">B</p>\n'], null);

      expect(result).toBe('repainted');
      expect(el.querySelector('.mx-content > div > p')?.textContent).toBe('B');
      // DOM と blocks の対応が取れないため、次も描画し直す。
      expect(patch(el, ['<p data-line="0">A</p>\n<div>\n', '<p data-line="2">C</p>\n'], null)).toBe('repainted');
    });

    it('空の文書になった', () => {
      painted(['<p data-line="0">a</p>\n']);

      expect(patch(el, [], null)).toBe('repainted');
      expect(el.querySelector('.mx-content')).toBeNull();
    });
  });

  it('描き直した後は再び差分で反映できる', () => {
    paint(el, ['<p data-line="0">a</p>\n']);
    patch(el, ['<p data-line="0">b</p>\n'], null);
    const [b] = tops();

    expect(patch(el, ['<p data-line="0">b</p>\n', '<p data-line="2">c</p>\n'], null)).toBe('patched');
    expect(tops()[0]).toBe(b);
  });
});
