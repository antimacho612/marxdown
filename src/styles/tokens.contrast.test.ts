/**
 * 既定テーマのコントラスト比を機械的に検証する。
 *
 * アクセシビリティの仕様が「コントラスト比 4.5:1 以上（既定テーマ）」と定めているが、色を目視で足すと必ずどこかが下回る。
 *
 * `tokens.css` を読んで実際の値を突き合わせる。JS 側に値を書き写すと二重管理になる（Storybook が `tokens.css` をそのまま読んでいるのと同じ理由）。
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

/** 宣言ブロックから `--mx-color-*` を取り出す。`var()` の別名は解決しない（実体だけを見る）。 */
function colors(source: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const [, name, value] of source.matchAll(/--mx-color-([\w-]+):\s*(#[0-9a-f]{6})\s*;/gi)) {
    if (name && value) found.set(name, value.toLowerCase());
  }
  return found;
}

/**
 * プレビュー面の CSS。
 *
 * GitHub Alerts の 5 色はここが accent から導出するため、`tokens.css` には実体が無い（ADR-0015）。
 */
const PREVIEW = readFileSync(fileURLToPath(new URL('./preview/preview.css', import.meta.url)), 'utf8');

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
])('%s テーマのコントラスト', (_name, theme) => {
  it.each(TEXT_PAIRS)('%s on %s が 4.5:1 以上', (fg, bg) => {
    const foreground = theme.get(fg);
    const background = theme.get(bg);
    expect(foreground, `--mx-color-${fg} が宣言されていない`).toBeDefined();
    expect(background, `--mx-color-${bg} が宣言されていない`).toBeDefined();

    const ratio = contrast(foreground!, background!);
    // 失敗したときに直すべき値が分かるよう、実際の色と比率をメッセージに載せる。
    expect(ratio, `${foreground} on ${background} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(TEXT_MIN);
  });
});

/**
 * `--mx-color-alert-*` の色相。`oklch(from var(--mx-color-accent) l c <色相>)` の形だけを対象にする。
 *
 * `note` は accent そのものなのでここには現れない（TEXT_PAIRS の `accent` on `bg` が見ている）。
 */
function alertHues(): ReadonlyArray<readonly [name: string, hue: number]> {
  const found: Array<readonly [string, number]> = [];
  const pattern = /--mx-color-alert-([\w-]+):\s*oklch\(from var\(--mx-color-accent\) l c (\d+(?:\.\d+)?)\)/g;
  for (const [, name, hue] of PREVIEW.matchAll(pattern)) {
    if (name && hue) found.push([name, Number(hue)]);
  }
  return found;
}

const ALERT_HUES = alertHues();

/** sRGB の 16 進表記を OKLCh へ。色相は使わないので返さない。 */
function toOklch(hex: string): { lightness: number; chroma: number } {
  const [red, green, blue] = [1, 3, 5].map((index) => channel(Number.parseInt(hex.slice(index, index + 2), 16)));
  const long = Math.cbrt(0.412_221_470_8 * red! + 0.536_332_536_3 * green! + 0.051_445_992_9 * blue!);
  const medium = Math.cbrt(0.211_903_498_2 * red! + 0.680_699_545_1 * green! + 0.107_396_956_6 * blue!);
  const short = Math.cbrt(0.088_302_461_9 * red! + 0.281_718_837_6 * green! + 0.629_978_700_5 * blue!);

  const lightness = 0.210_454_255_3 * long + 0.793_617_785 * medium - 0.004_072_046_8 * short;
  const a = 1.977_998_495_1 * long - 2.428_592_205 * medium + 0.450_593_709_9 * short;
  const b = 0.025_904_037_1 * long + 0.782_771_766_2 * medium - 0.808_675_766 * short;
  return { lightness, chroma: Math.hypot(a, b) };
}

/**
 * OKLCh を sRGB の 16 進表記へ。
 *
 * 色域外は素直に切り詰める。ブラウザは CSS Color 4 の色域圧縮を行うが、ここで見たいのはコントラスト比であり、既定テーマの 4 色はどちらの方法でも同じ値になることを確かめてある。
 */
function fromOklch(lightness: number, chroma: number, hue: number): string {
  const radians = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(radians);
  const b = chroma * Math.sin(radians);
  const long = (lightness + 0.396_337_777_4 * a + 0.215_803_757_3 * b) ** 3;
  const medium = (lightness - 0.105_561_345_8 * a - 0.063_854_172_8 * b) ** 3;
  const short = (lightness - 0.089_484_177_5 * a - 1.291_485_548 * b) ** 3;

  const channels = [
    4.076_741_662_1 * long - 3.307_711_591_3 * medium + 0.230_969_929_2 * short,
    -1.268_438_004_6 * long + 2.609_757_401_1 * medium - 0.341_319_396_5 * short,
    -0.004_196_086_3 * long - 0.703_418_614_7 * medium + 1.707_614_701 * short,
  ];

  return `#${channels.map(encode).join('')}`;
}

function encode(value: number): string {
  const encoded = value <= 0.003_130_8 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055;
  return Math.min(255, Math.max(0, Math.round(encoded * 255)))
    .toString(16)
    .padStart(2, '0');
}

describe.each([
  ['ライト', LIGHT],
  ['ダーク', DARK],
])('%s テーマの GitHub Alerts (ADR-0015)', (_name, theme) => {
  it('preview.css が 4 色の色相を宣言している', () => {
    // 宣言の形が変わって正規表現が一致しなくなると、以下の検査が 0 件になって失敗せずに通る。
    expect(ALERT_HUES.map(([name]) => name).toSorted()).toEqual(['caution', 'important', 'tip', 'warning']);
  });

  it.each(ALERT_HUES)('alert-%s on bg が 4.5:1 以上', (name, hue) => {
    const accent = theme.get('accent');
    const background = theme.get('bg');
    expect(accent, '--mx-color-accent が宣言されていない').toBeDefined();
    expect(background, '--mx-color-bg が宣言されていない').toBeDefined();

    const { lightness, chroma } = toOklch(accent!);
    const derived = fromOklch(lightness, chroma, hue);
    const ratio = contrast(derived, background!);
    expect(ratio, `alert-${name} = ${derived} on ${background} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(
      TEXT_MIN,
    );
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
