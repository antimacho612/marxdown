// @vitest-environment jsdom
/**
 * 書き出しに使う CSS の収集（F-VIEW-18）。
 *
 * 画面の規則から本文に関わるものだけを拾えていること、PDF のために明るい配色のトークンだけを取り出せていることを確かめる。
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { collectCss, lightTokens } from './css';

function sheet(css: string): void {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.append(style);
}

beforeEach(() => {
  document.head.replaceChildren();
});

describe('collectCss', () => {
  it('本文の規則を残し、クロームの規則を落とす', async () => {
    sheet(`
      .mx-preview { color: red; }
      .hljs-keyword { color: blue; }
      .titlebar { height: 32px; }
      body { display: grid; }
    `);

    const css = await collectCss(false);
    expect(css).toContain('.mx-preview');
    expect(css).toContain('.hljs-keyword');
    expect(css).not.toContain('.titlebar');
    expect(css).not.toContain('display: grid');
  });

  it('@media は中身を絞ってから包み直す', async () => {
    sheet(`
      @media (prefers-color-scheme: dark) {
        :root { --mx-color-bg: black; }
        .titlebar { color: white; }
      }
      @media print {
        .statusbar { display: none; }
      }
    `);

    const css = await collectCss(false);
    expect(css).toContain('prefers-color-scheme: dark');
    expect(css).toContain('--mx-color-bg');
    expect(css).not.toContain('.titlebar');
    expect(css).not.toContain('@media print');
  });

  it('配色の規則（data-mx-theme）を残す', async () => {
    sheet(`[data-mx-theme="github"] { --mx-color-fg: #111; }`);
    expect(await collectCss(false)).toContain('data-mx-theme');
  });
});

describe('lightTokens', () => {
  it('暗い配色が上書きしているトークンだけを、既定の値で返す', () => {
    sheet(`
      :root { --mx-color-bg: white; --mx-color-fg: black; --mx-font-content: serif; }
      :root[data-theme='dark'] { --mx-color-bg: black; --mx-color-fg: white; }
    `);

    const tokens = lightTokens();
    expect(tokens.get('--mx-color-bg')).toBe('white');
    expect(tokens.get('--mx-color-fg')).toBe('black');
    // フォントは配色ではない。設定による上書きを印刷でも保つため、ここでは返さない。
    expect(tokens.has('--mx-font-content')).toBe(false);
  });
});
