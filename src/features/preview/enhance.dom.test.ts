// @vitest-environment jsdom
/**
 * スコープ外の画像を許可する導線（ADR-0006）。
 *
 * 検証するのは 3 つである。
 * 解決後のパスを出していること（何を許可するのか判断できないと意味がない）、見つからないだけの画像には許可ボタンを出さないこと、そして許可の単位がディレクトリなので 1 クリックで同じ場所の他の画像も表示されることである。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getPlatform, setPlatform, type Platform } from '@/platform';

import { enhance } from './enhance';

const original = getPlatform();

/** スコープ外として拒む。`path` は symlink まで解決した後のパスである。 */
function outOfScope(path: string): unknown {
  return { kind: 'out-of-scope', message: `許可されたディレクトリの外を参照している: ${path}`, path };
}

let allowed: string[];

function container(html: string): HTMLElement {
  const element = document.createElement('div');
  element.innerHTML = html;
  document.body.append(element);
  return element;
}

beforeEach(() => {
  document.body.replaceChildren();
  allowed = [];
});

afterEach(() => {
  setPlatform(original);
});

describe('拒まれた画像', () => {
  it('ドキュメントに書かれた文字列ではなく、解決後のパスを出す', async () => {
    setPlatform({
      ...original,
      resolveAsset: () => Promise.reject(outOfScope('C:/secret/img/a.png')),
    } as Platform);

    const element = container('<img src="../../secret/img/a.png">');
    enhance(element, { baseDir: 'C:/work/docs' });

    await vi.waitFor(() => {
      expect(element.querySelector('.mx-image-blocked__path')?.textContent).toBe('C:/secret/img/a.png');
    });
  });

  it('見つからないだけの画像には許可ボタンを出さない', async () => {
    setPlatform({
      ...original,
      resolveAsset: () => Promise.reject({ kind: 'not-found', message: '無い' }),
    } as Platform);

    const element = container('<img src="./missing.png">');
    enhance(element, { baseDir: 'C:/work/docs' });

    await vi.waitFor(() => {
      expect(element.querySelector('.mx-image-blocked')).not.toBeNull();
    });
    expect(element.querySelector('.mx-image-blocked__allow')).toBeNull();
  });

  it('許可すると画像に戻り、alt が残る', async () => {
    setPlatform({
      ...original,
      resolveAsset: () => Promise.reject(outOfScope('C:/assets/logo.png')),
      allowImageDir: () => Promise.resolve('asset://localhost/logo.png'),
    } as Platform);

    const element = container('<img src="../assets/logo.png" alt="ロゴ">');
    enhance(element, { baseDir: 'C:/work/docs' });

    await vi.waitFor(() => {
      expect(element.querySelector<HTMLButtonElement>('.mx-image-blocked__allow')).not.toBeNull();
    });
    element.querySelector<HTMLButtonElement>('.mx-image-blocked__allow')?.click();

    await vi.waitFor(() => {
      const img = element.querySelector('img');
      expect(img?.getAttribute('src')).toBe('asset://localhost/logo.png');
      expect(img?.alt).toBe('ロゴ');
    });
  });

  it('同じディレクトリの他の画像も、押し直さずに表示される', async () => {
    // 許可されたディレクトリの直下だけを通す。`resolveAsset` の振る舞いを Rust 側に合わせる。
    setPlatform({
      ...original,
      resolveAsset: (href: string) => {
        const path = href.replace('../assets/', 'C:/assets/');
        return allowed.includes('C:/assets') ? Promise.resolve(`asset://${path}`) : Promise.reject(outOfScope(path));
      },
      allowImageDir: () => {
        allowed.push('C:/assets');
        return Promise.resolve('asset://C:/assets/a.png');
      },
    } as Platform);

    const element = container('<img src="../assets/a.png"><img src="../assets/b.png">');
    enhance(element, { baseDir: 'C:/work/docs' });

    await vi.waitFor(() => {
      expect(element.querySelectorAll('.mx-image-blocked__allow')).toHaveLength(2);
    });
    // 押すのは 1 つだけ。
    element.querySelector<HTMLButtonElement>('.mx-image-blocked__allow')?.click();

    await vi.waitFor(() => {
      expect(element.querySelectorAll('img')).toHaveLength(2);
      expect(element.querySelectorAll('.mx-image-blocked')).toHaveLength(0);
    });
  });

  it('許可できなかったときは、その場で伝える', async () => {
    setPlatform({
      ...original,
      resolveAsset: () => Promise.reject(outOfScope('C:/assets/logo.png')),
      allowImageDir: () => Promise.reject({ kind: 'not-found', message: '消えた' }),
    } as Platform);

    const element = container('<img src="../assets/logo.png">');
    enhance(element, { baseDir: 'C:/work/docs' });

    await vi.waitFor(() => {
      expect(element.querySelector('.mx-image-blocked__allow')).not.toBeNull();
    });
    element.querySelector<HTMLButtonElement>('.mx-image-blocked__allow')?.click();

    await vi.waitFor(() => {
      expect(element.querySelector('.mx-image-blocked__reason')?.textContent).toBe('表示を許可できませんでした');
    });
  });
});

describe('<picture><source srcset> のダークモード用画像', () => {
  it('相対パスの srcset を解決する', async () => {
    setPlatform({
      ...original,
      resolveAsset: (href: string) => Promise.resolve(`asset://${href.replace('../assets/', 'C:/assets/')}`),
    } as Platform);

    const element = container(
      '<picture><source media="(prefers-color-scheme: dark)" srcset="../assets/logo-dark.svg" /><img src="../assets/logo-light.svg" alt="logo" /></picture>',
    );
    enhance(element, { baseDir: 'C:/work/docs' });

    await vi.waitFor(() => {
      expect(element.querySelector('source')?.getAttribute('srcset')).toBe('asset://C:/assets/logo-dark.svg');
      expect(element.querySelector('img')?.getAttribute('src')).toBe('asset://C:/assets/logo-light.svg');
    });
  });

  it('記述子つきの複数候補もそれぞれ解決する', async () => {
    setPlatform({
      ...original,
      resolveAsset: (href: string) => Promise.resolve(`asset://${href}`),
    } as Platform);

    const element = container('<picture><source srcset="a.png 1x, b.png 2x" /><img src="a.png" /></picture>');
    enhance(element, { baseDir: 'C:/work/docs' });

    await vi.waitFor(() => {
      expect(element.querySelector('source')?.getAttribute('srcset')).toBe('asset://a.png 1x, asset://b.png 2x');
    });
  });

  it('解決に失敗した候補だけを外し、全滅すれば source ごと外す', async () => {
    setPlatform({
      ...original,
      resolveAsset: (href: string) =>
        href === 'missing.svg'
          ? Promise.reject({ kind: 'not-found', message: '無い' })
          : Promise.resolve(`asset://${href}`),
    } as Platform);

    const element = container(
      '<picture><source srcset="missing.svg" /><img src="../assets/logo-light.svg" alt="logo" /></picture>',
    );
    enhance(element, { baseDir: 'C:/work/docs' });

    await vi.waitFor(() => {
      expect(element.querySelector('source')).toBeNull();
      expect(element.querySelector('img')).not.toBeNull();
    });
  });
});
