/**
 * 既定テーマのコントラスト比を機械的に見張る。
 *
 * 03.ux-spec/10-accessibility.md が「コントラスト比 4.5:1 以上（既定テーマ）」と定めているが、
 * 色を目視で足すと必ずどこかが落ちる。実際、`fg-subtle` はライトで 3.08:1 まで下がっていた。
 *
 * `tokens.css` を読んで実際の値を突き合わせる。JS 側に値を書き写すと二重管理になる
 * （Storybook が `tokens.css` をそのまま読んでいるのと同じ理由）。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const SOURCE = readFileSync(fileURLToPath(new URL('./tokens.css', import.meta.url)), 'utf8');

/** WCAG 1.4.3 の通常文字。大きな文字の緩和（3:1）は使わない。クロームの文字は 13px 以下である。 */
const TEXT_MIN = 4.5;

/**
 * 文字色と、その文字が実際に載る面の組。
 *
 * `bg-hover` を含めていないのは、そこだけ `fg-subtle` が 4.5 に届かないため。
 * ホバー中は各コンポーネントが文字色を 1 段上げる（`tokens.css` の文字色のコメント）。
 */
const TEXT_PAIRS: ReadonlyArray<readonly [fg: string, bg: string]> = [
  ['fg', 'bg'],
  ['fg', 'bg-subtle'],
  ['fg', 'bg-inset'],
  ['fg-muted', 'bg'],
  ['fg-muted', 'bg-subtle'],
  ['fg-muted', 'bg-inset'],
  ['fg-subtle', 'bg'],
  ['fg-subtle', 'bg-subtle'],
  ['fg-subtle', 'bg-inset'],
  ['accent', 'bg'],
  ['accent', 'bg-subtle'],
  ['danger', 'bg'],
  ['danger', 'bg-subtle'],
  ['danger', 'bg-inset'],
  ['danger', 'bg-hover'],
  ['warning', 'bg'],
  ['warning', 'bg-subtle'],
  ['warning', 'bg-inset'],
  ['alert-tip', 'bg'],
  ['alert-important', 'bg'],
  // アクセント面に載る文字。ホバーと押し込みでも読めること。
  ['accent-fg', 'accent'],
  ['accent-fg', 'accent-hover'],
  ['accent-fg', 'accent-active'],
];

/**
 * テーマごとの宣言ブロック。
 *
 * ライトは `:root`、ダークは `:root[data-theme='dark']`。
 * OS 追従側（`@media`）はダークと同じ値であることを別途確かめる。
 */
function block(selector: string): string {
  const start = SOURCE.indexOf(selector);
  expect(start, `${selector} が見つからない`).toBeGreaterThanOrEqual(0);
  const open = SOURCE.indexOf('{', start);
  return SOURCE.slice(open, SOURCE.indexOf('\n}', open));
}

/** 宣言ブロックから `--mx-color-*` を拾う。`var()` の別名は解決しない（実体だけを見る）。 */
function colors(source: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const [, name, value] of source.matchAll(/--mx-color-([\w-]+):\s*(#[0-9a-f]{6})\s*;/gi)) {
    if (name && value) found.set(name, value.toLowerCase());
  }
  return found;
}

const LIGHT = colors(block(':root {'));
const DARK = colors(block(":root[data-theme='dark']"));
const SYSTEM_DARK = colors(block(':root:not([data-theme='));

function channel(value: number): number {
  const ratio = value / 255;
  return ratio <= 0.040_45 ? ratio / 12.92 : ((ratio + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2.x の相対輝度。 */
function luminance(hex: string): number {
  const [red, green, blue] = [1, 3, 5].map((index) => channel(Number.parseInt(hex.slice(index, index + 2), 16)));
  return 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!;
}

function contrast(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].toSorted((x, y) => y - x);
  return (high! + 0.05) / (low! + 0.05);
}

describe.each([
  ['ライト', LIGHT],
  ['ダーク', DARK],
])('%s テーマのコントラスト (03.ux-spec/10-accessibility.md)', (_name, theme) => {
  it.each(TEXT_PAIRS)('%s on %s が 4.5:1 以上', (fg, bg) => {
    const foreground = theme.get(fg);
    const background = theme.get(bg);
    expect(foreground, `--mx-color-${fg} が宣言されていない`).toBeDefined();
    expect(background, `--mx-color-${bg} が宣言されていない`).toBeDefined();

    const ratio = contrast(foreground!, background!);
    // 落ちたときに直すべき値が分かるよう、実際の色と比率をメッセージに載せる。
    expect(ratio, `${foreground} on ${background} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(TEXT_MIN);
  });
});

describe('テーマの宣言', () => {
  it('OS 追従（@media）が data-theme="dark" と同じ値を宣言する', () => {
    // 片方だけ直すと「OS はダーク / アプリは未指定」の経路だけが古い色のまま残る。
    expect(Object.fromEntries(SYSTEM_DARK)).toEqual(Object.fromEntries(DARK));
  });

  it('ライトで宣言した色はダークでも宣言されている', () => {
    // caption-close はテーマに追従しない（Windows の閉じるボタンの色）。
    const exempt = new Set(['caption-close', 'caption-close-active', 'caption-close-fg']);
    // `Iterator#filter` は `lib: ES2023` の型定義に無いため、素直に回す。
    const missing: string[] = [];
    for (const name of LIGHT.keys()) {
      if (!exempt.has(name) && !DARK.has(name)) missing.push(name);
    }
    expect(missing).toEqual([]);
  });
});
