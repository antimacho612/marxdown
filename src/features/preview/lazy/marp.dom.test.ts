// @vitest-environment jsdom
/**
 * Marp のスライドの組み立て（ADR-0023 §3.3）。
 *
 * marp-core の出力は信頼できない入力として扱う。
 * 検証するのは、枠をこちらで作り直していること、`<section>` がサニタイズされていること、`style` の `url()` が許可リストを通ること、テーマの CSS が面の外へ出ないことである。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { jaMarp } from '@/i18n/ja-marp';
import type { MarpRender } from '@/markdown/protocol';
import { getPlatform, setPlatform, type Platform } from '@/platform';

import { disposeMarp, mountMarp } from './marp';

const original = getPlatform();

let container: HTMLElement;

beforeEach(() => {
  document.body.replaceChildren();
  container = document.createElement('div');
  container.id = 'mx-preview';
  document.body.append(container);
});

afterEach(() => {
  disposeMarp();
  setPlatform(original);
});

function render(slides: string[], css = ''): MarpRender {
  return { slides, css, outline: [] };
}

function frame(section: string, attributes = 'width="1280" height="720"'): string {
  return `<svg data-marpit-svg="" viewBox="0 0 1280 720"><foreignObject ${attributes}>${section}</foreignObject></svg>`;
}

describe('SVG の枠', () => {
  it('枠を作り直し、検証した寸法だけを引き継ぐ', () => {
    mountMarp(
      container,
      render([
        frame(
          '<section id="1" data-line="3"><h1>a</h1></section>',
          'width="50%" height="720" x="50%" onload="alert(1)" requiredExtensions="x" data-marpit-advanced-background="content"',
        ),
      ]),
      '',
    );

    const foreignObject = container.querySelector('foreignObject');
    expect(foreignObject?.getAttribute('width')).toBe('50%');
    expect(foreignObject?.getAttribute('x')).toBe('50%');
    expect(foreignObject?.getAttribute('data-marpit-advanced-background')).toBe('content');
    expect(foreignObject?.hasAttribute('onload')).toBe(false);
    expect(foreignObject?.hasAttribute('requiredExtensions')).toBe(false);
    expect(container.querySelector('section')?.dataset['line']).toBe('3');
  });

  it('分割背景では本文の <section> にだけ行番号を残す', () => {
    const section = '<section data-line="7"><h1>a</h1></section>';
    mountMarp(
      container,
      render([
        `<svg data-marpit-svg="" viewBox="0 0 1280 720">${['background', 'content', 'pseudo']
          .map(
            (layer) =>
              `<foreignObject width="1280" height="720" data-marpit-advanced-background="${layer}">${section}</foreignObject>`,
          )
          .join('')}</svg>`,
      ]),
      '',
    );
    const lines = [...container.querySelectorAll('foreignObject')].map((frame) =>
      frame.querySelector('section')?.getAttribute('data-line'),
    );
    expect(lines).toEqual([null, '7', null]);
  });

  it('寸法の形が違う枠と、想定外の要素はスライドごと出さない', () => {
    mountMarp(
      container,
      render([
        '<svg data-marpit-svg="" viewBox="0 0 1280 720; x"><foreignObject><section>a</section></foreignObject></svg>',
        '<div><section>b</section></div>',
      ]),
      '',
    );
    expect(container.querySelectorAll('svg')).toHaveLength(0);
  });

  it('<section> の中の script・style・foreignObject を除去する', () => {
    mountMarp(
      container,
      render([
        frame(
          '<section><script>alert(1)</script><style>body{display:none}</style><svg><foreignObject><img src=x onerror=alert(1)></foreignObject></svg><p onclick="alert(1)">a</p></section>',
        ),
      ]),
      '',
    );
    const section = container.querySelector('section');
    expect(section?.querySelector('script')).toBeNull();
    expect(section?.querySelector('style')).toBeNull();
    expect(section?.querySelector('foreignObject')).toBeNull();
    expect(section?.querySelector('p')?.hasAttribute('onclick')).toBe(false);
    expect(container.querySelectorAll('foreignObject')).toHaveLength(1);
  });
});

describe('style の url()', () => {
  it('許可されないスキームは none にする', () => {
    mountMarp(
      container,
      render([
        frame(
          '<section style="background-image:url(&quot;https://example.com/a.png&quot;)"><figure style="background-image:url(&quot;javascript:alert(1)&quot;)"></figure><figure style="background-image:url(file:///C:/secret.png)"></figure></section>',
        ),
      ]),
      '',
    );
    expect(container.querySelector('section')?.style.backgroundImage).toBe('url("https://example.com/a.png")');
    const [script, file] = container.querySelectorAll('figure');
    expect(script?.style.backgroundImage).toBe('none');
    expect(file?.style.backgroundImage).toBe('none');
  });

  it('相対パスは resolveAsset で解決し、解決できなければ none にする', async () => {
    const resolveAsset = vi.fn((href: string) =>
      href === 'img/a.png' ? Promise.resolve('asset://localhost/C:/notes/img/a.png') : Promise.reject(new Error('x')),
    );
    setPlatform({ ...original, resolveAsset } as Platform);

    mountMarp(
      container,
      render([
        frame(
          '<section><figure style="background-image:url(&quot;img/a.png&quot;)"></figure><figure style="background-image:url(&quot;../secret.png&quot;)"></figure></section>',
        ),
      ]),
      'C:/notes',
    );

    const [ok, ng] = container.querySelectorAll('figure');
    await vi.waitFor(() => {
      expect(ok?.style.backgroundImage).toBe('url("asset://localhost/C:/notes/img/a.png")');
      expect(ng?.style.backgroundImage).toBe('none');
    });
    expect(resolveAsset).toHaveBeenCalledWith('img/a.png', 'C:/notes');
  });

  it('無題の文書では相対パスを解決しない', async () => {
    const resolveAsset = vi.fn(() => Promise.resolve('asset://x'));
    setPlatform({ ...original, resolveAsset } as Platform);

    mountMarp(
      container,
      render([frame('<section><figure style="background-image:url(a.png)"></figure></section>')]),
      '',
    );

    await vi.waitFor(() => {
      expect(container.querySelector('figure')?.style.backgroundImage).toBe('none');
    });
    expect(resolveAsset).not.toHaveBeenCalled();
  });
});

describe('自作テーマの通知', () => {
  it('読み込めなかった最初の 1 件と、残りの件数を出す', () => {
    const { notice } = mountMarp(
      container,
      {
        ...render([frame('<section></section>')]),
        themeProblems: [
          { path: 'C:/t/a.css', kind: 'missing' },
          { path: 'C:/t/b.css', kind: 'no-theme-name' },
        ],
      },
      '',
    );
    expect(notice).toBe(jaMarp.themeFailed(jaMarp.themeProblem.missing, 'C:/t/a.css', 1));
  });
});

describe('テーマの CSS', () => {
  it('#mx-preview の入れ子にして本文の中に置く', () => {
    const { notice } = mountMarp(container, render([frame('<section></section>')], 'section{color:red}'), '');
    expect(notice).toBeNull();
    const style = container.querySelector('style');
    expect(style?.textContent).toContain('#mx-preview {\nsection{color:red}\n}');
  });

  it('波かっこを余分に閉じて外へ出るものは適用しない', () => {
    const { notice } = mountMarp(
      container,
      render([frame('<section></section>')], '}\nbody { display: none; }\n#mx-preview {'),
      '',
    );
    expect(notice).toBe(jaMarp.styleRejected);
    expect(container.querySelector('style')?.textContent).not.toContain('body {');
  });
});
