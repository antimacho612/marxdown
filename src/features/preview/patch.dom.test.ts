// @vitest-environment jsdom
/**
 * Split の再描画で変わったブロックだけを差し替えること（#159）。
 *
 * 作り直すと、段階的描画の途中でスクロール位置が切り詰められ、処理済みの要素の高さも変わってプレビューが動く。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    painted(['<p data-line="3">a</p>\n'], 'title: x');

    patch(el, ['<p data-line="3">a</p>\n'], 'title: y');
    expect(el.querySelector('.mx-front-matter')?.textContent).toBe('title: y');

    patch(el, ['<p data-line="0">a</p>\n'], null);
    expect(el.querySelector('.mx-front-matter')).toBeNull();

    patch(el, ['<p data-line="3">a</p>\n'], 'title: z');
    expect(el.firstElementChild?.className).toBe('mx-front-matter');
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

    it('差し替える部分が閉じていない生の HTML で終わり、後ろに残す要素がある', () => {
      painted(['<p data-line="0">a</p>\n', '<p data-line="2">b</p>\n', '<p data-line="4">c</p>\n']);

      // 閉じていない `<div>` は、全体をパースすると後続のブロックを取り込む。部分だけを入れると構造が変わる。
      const result = patch(
        el,
        ['<p data-line="0">A</p>\n<div>\n', '<p data-line="2">b</p>\n', '<p data-line="4">c</p>\n'],
        null,
      );

      expect(result).toBe('repainted');
      expect([...el.querySelectorAll('.mx-content > div > p')].map((p) => p.textContent)).toEqual(['b', 'c']);
    });

    it('空の文書になった', () => {
      painted(['<p data-line="0">a</p>\n']);

      expect(patch(el, [], null)).toBe('repainted');
      expect(el.querySelector('.mx-content')).toBeNull();
    });
  });

  describe('生の HTML が複数のブロックを包む (#148 / #159)', () => {
    /** `<div align="center">` から `</div>` までが 1 つの要素になり、DOM のトップレベルの数と `blocks` の数が一致しない。 */
    const WRAPPED = [
      '<div align="center">\n',
      '<h2 data-line="2">title</h2>\n',
      '<p data-line="4">lead</p>\n</div>\n',
      '<p data-line="8">a</p>\n',
      '<p data-line="10">b</p>\n',
    ];

    it('包んでいる要素の外を編集しても、包んでいる要素は作り直さない', () => {
      painted(WRAPPED);
      const [wrapper, a] = tops();

      const result = patch(el, [...WRAPPED.slice(0, 4), '<p data-line="10">B</p>\n'], null);

      expect(result).toBe('patched');
      const after = tops();
      expect(after[0]).toBe(wrapper);
      expect(after[1]).toBe(a);
      expect(after[2]?.textContent).toBe('B');
    });

    it('包んでいる要素より後で行が増えても、data-line を書き換えて残す', () => {
      painted(WRAPPED);
      const [wrapper, a, b] = tops();

      patch(el, [...WRAPPED.slice(0, 3), '<p data-line="8">a\nx</p>\n', '<p data-line="11">b</p>\n'], null);

      const after = tops();
      expect(after[0]).toBe(wrapper);
      expect(after[1]).not.toBe(a);
      expect(after[2]).toBe(b);
      expect(after[2]?.getAttribute('data-line')).toBe('11');
    });

    it('包んでいる要素より前で行が増えると、中の data-line まで書き換える', () => {
      // 先頭以外の生の HTML は直前のブロックに連結される（`markdown/pipeline.ts` の `renderChunks`）。
      painted([
        '<p data-line="0">x</p>\n',
        '<p data-line="2">y</p>\n<div align="center">\n',
        '<h2 data-line="4">title</h2>\n',
        '<p data-line="6">lead</p>\n</div>\n',
      ]);
      const [, y, wrapper] = tops();

      const result = patch(
        el,
        [
          '<p data-line="0">x\nz</p>\n',
          '<p data-line="3">y</p>\n<div align="center">\n',
          '<h2 data-line="5">title</h2>\n',
          '<p data-line="7">lead</p>\n</div>\n',
        ],
        null,
      );

      expect(result).toBe('patched');
      const after = tops();
      expect(after[1]).toBe(y);
      expect(after[1]?.getAttribute('data-line')).toBe('3');
      expect(after[2]).toBe(wrapper);
      expect([...(wrapper?.querySelectorAll('[data-line]') ?? [])].map((e) => e.getAttribute('data-line'))).toEqual([
        '5',
        '7',
      ]);
    });

    it('包んでいる要素の中を編集すると、包んでいる要素ごと差し替える', () => {
      painted(WRAPPED);
      const [wrapper, a] = tops();

      const result = patch(el, [WRAPPED[0] ?? '', '<h2 data-line="2">TITLE</h2>\n', ...WRAPPED.slice(2)], null);

      expect(result).toBe('patched');
      const after = tops();
      expect(after).toHaveLength(3);
      expect(after[0]).not.toBe(wrapper);
      expect(after[0]?.querySelector('h2')?.textContent).toBe('TITLE');
      expect(after[1]).toBe(a);
    });

    it('閉じていない要素が末尾まで包んでいても、差分で反映する', () => {
      const open = [
        '<p data-line="0">a</p>\n',
        '<p data-line="2">b</p>\n<div>\n',
        '<p data-line="4">c</p>\n',
        '<p data-line="6">d</p>\n',
      ];
      painted(open);
      const [a] = tops();

      const result = patch(el, [...open.slice(0, 3), '<p data-line="6">D</p>\n'], null);

      expect(result).toBe('patched');
      expect(tops()[0]).toBe(a);
      expect([...el.querySelectorAll('.mx-content > div > p')].map((p) => p.textContent)).toEqual(['c', 'D']);
    });

    it('閉じていない要素の後ろへ足したブロックは、その要素の中に入る', () => {
      const open = ['<p data-line="0">a</p>\n', '<p data-line="2">b</p>\n<div>\n'];
      painted(open);

      patch(el, [...open, '<p data-line="4">c</p>\n'], null);

      expect(el.querySelector('.mx-content > div > p')?.textContent).toBe('c');
    });
  });

  it('先頭のブロックが DOM に何も残さなくても差分で反映する', () => {
    painted(['<!-- note -->\n', '<p data-line="2">a</p>\n', '<p data-line="4">b</p>\n']);
    const [a] = tops();

    const result = patch(el, ['<!-- note -->\n', '<p data-line="2">a</p>\n', '<p data-line="4">B</p>\n'], null);

    expect(result).toBe('patched');
    expect(tops()[0]).toBe(a);
    expect(tops().map((e) => e.textContent)).toEqual(['a', 'B']);
  });

  it('描き直した後は再び差分で反映できる', () => {
    paint(el, ['<p data-line="0">a</p>\n']);
    patch(el, ['<p data-line="0">b</p>\n'], null);
    const [b] = tops();

    expect(patch(el, ['<p data-line="0">b</p>\n', '<p data-line="2">c</p>\n'], null)).toBe('patched');
    expect(tops()[0]).toBe(b);
  });
});
