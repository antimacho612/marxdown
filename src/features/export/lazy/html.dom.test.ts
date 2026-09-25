// @vitest-environment jsdom
/**
 * HTML の書き出し（F-VIEW-18）。
 *
 * 書き出した HTML は Marxdown の外（ブラウザ）で開かれる。
 * 中心ユースケースは「自分が書いていない Markdown を開く」ことであり、その内容をスクリプトが動く形で持ち出さないことを確かめる（ADR-0006）。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getPlatform, setPlatform, type Platform } from '@/platform';

import { buildHtml } from './html';

const original = getPlatform();

function surface(): HTMLElement {
  const element = document.createElement('div');
  element.id = 'mx-preview';
  element.className = 'mx-preview';
  element.dataset['mxTableStyle'] = 'grid';
  document.body.append(element);
  return element;
}

function body(html: string): HTMLElement {
  const element = document.createElement('div');
  element.innerHTML = html;
  return element;
}

async function parse(html: string): Promise<Document> {
  return new DOMParser().parseFromString(html, 'text/html');
}

beforeEach(() => {
  document.body.replaceChildren();
  document.head.replaceChildren();
});

afterEach(() => {
  setPlatform(original);
});

describe('buildHtml', () => {
  it('スクリプトを禁じる CSP を付け、スクリプトを含めない', async () => {
    const out = await parse(await buildHtml({ body: body('<p>hi</p>'), surface: surface(), title: 'a.md' }));

    const csp = out.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content') ?? '';
    expect(csp).toContain("default-src 'none'");
    expect(csp).not.toContain('script-src');
    expect(out.querySelector('script')).toBeNull();
  });

  it('面の属性を写し、題名はテキストとして入れる', async () => {
    const out = await parse(
      await buildHtml({ body: body('<p>hi</p>'), surface: surface(), title: '<script>alert(1)</script>.md' }),
    );

    const main = out.querySelector('main');
    expect(main?.className).toBe('mx-preview');
    expect(main?.dataset['mxTableStyle']).toBe('grid');
    expect(main?.children.length).toBe(1);
    expect(main?.textContent).toBe('hi');
    expect(out.title).toBe('<script>alert(1)</script>.md');
    expect(out.querySelector('script')).toBeNull();
  });

  it('ローカル画像を data URI にし、読めないものは代替テキストにする', async () => {
    setPlatform({
      ...original,
      inlineImage: (src: string) =>
        src.includes('ok.png')
          ? Promise.resolve('data:image/png;base64,AAAA')
          : Promise.reject({ kind: 'out-of-scope', message: 'x' }),
    } as Platform);

    const out = await parse(
      await buildHtml({
        body: body(
          '<img src="asset://localhost/C%3A%5Cdocs%5Cok.png" alt="ok">' +
            '<img src="asset://localhost/C%3A%5Csecret%5Cng.png" alt="ng">' +
            '<img src="https://example.com/remote.png" alt="remote">',
        ),
        surface: surface(),
        title: 'a.md',
      }),
    );

    const images = [...out.querySelectorAll('img')].map((img) => img.getAttribute('src'));
    expect(images).toEqual(['data:image/png;base64,AAAA', 'https://example.com/remote.png']);
    expect(out.querySelector('main')?.textContent).toContain('ng');
  });
});
