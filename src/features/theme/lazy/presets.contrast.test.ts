/**
 * 組み込み配色のコントラスト比を検証する。
 *
 * 本家の公表値、特にライト版は淡い色が多く、そのままではリンクやインラインコードが本文として読めない。
 * ここで見るのはプレビューの本文で読む色と、それが載る面の組だけである。
 * コメントの色のように、本家が意図して淡くしている色は対象にしない。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { Preset, TokenKey } from './preset';
import { PRESETS } from './presets';

const PREVIEW = readFileSync(fileURLToPath(new URL('../../../styles/preview/preview.css', import.meta.url)), 'utf8');

/** インラインコードの背景で文字色を混ぜる比率。`preview.css` の宣言から読む。 */
const CHIP = (() => {
  const found = /background: color-mix\(in srgb, var\(--mx-color-code-builtin\) (\d+)%, var\(--mx-color-bg\)\);/u.exec(
    PREVIEW,
  )?.[1];
  return found === undefined ? undefined : Number(found) / 100;
})();

/** WCAG 1.4.3 の通常文字。 */
const TEXT_MIN = 4.5;

/** 見出し（大きな文字）とコードブロックの記法の色。WCAG 1.4.3 の大きな文字と 1.4.11 の非テキストの基準。 */
const LARGE_MIN = 3;

function channel(value: number): number {
  const ratio = value / 255;
  return ratio <= 0.040_45 ? ratio / 12.92 : ((ratio + 0.055) / 1.055) ** 2.4;
}

function parse(hex: string): number[] {
  return [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));
}

/** WCAG 2.x の相対輝度。 */
function luminance(hex: string): number {
  const [red, green, blue] = parse(hex).map(channel);
  return 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!;
}

function contrast(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].toSorted((x, y) => y - x);
  return (high! + 0.05) / (low! + 0.05);
}

/** `color-mix(in srgb, a p, b)` と同じ計算。sRGB の符号化された値をそのまま線形に補間する。 */
function mix(a: string, b: string, ratio: number): string {
  const right = parse(b);
  const channels = parse(a).map((value, index) => Math.round(value * ratio + right[index]! * (1 - ratio)));
  return `#${channels.map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

type Side = (key: TokenKey) => string;

/** 配色 1 枚を、実際に表示される明暗ごとの色の組に分ける。 */
function sides(preset: Preset): ReadonlyArray<readonly [name: string, side: Side]> {
  if (preset.scheme !== undefined) {
    const { colors } = preset;
    return [[preset.scheme, (key) => colors[key]]];
  }
  const { colors } = preset;
  return [
    ['light', (key) => colors[key][0]],
    ['dark', (key) => colors[key][1]],
  ];
}

const CASES = Object.entries(PRESETS).flatMap(([id, preset]) =>
  sides(preset).map(([scheme, side]) => [`${id} (${scheme})`, side] as const),
);

describe('組み込み配色のコントラスト', () => {
  it('preview.css からインラインコードの背景の比率を読める', () => {
    // 宣言の形が変わって読めなくなると、インラインコードの検査が意味を失う。
    expect(CHIP).toBeDefined();
  });

  it.each(CASES)('%s', (_name, side) => {
    const bg = side('bg');
    const subtle = side('bgSubtle');
    const failures: string[] = [];

    const check = (key: TokenKey, surface: string, min: number, color = side(key)): void => {
      const ratio = contrast(color, surface);
      if (ratio < min) failures.push(`${key} ${color} on ${surface} = ${ratio.toFixed(2)}:1 (< ${min})`);
    };

    // 本文・引用・脚注の文字と、リンク。
    for (const key of ['fg', 'fgMuted', 'accent'] as const) {
      check(key, bg, TEXT_MIN);
      check(key, subtle, TEXT_MIN);
    }
    // 箇条書きの記号（既定の配色の場合）と、読ませなかった参照の痕跡。
    check('fgSubtle', bg, LARGE_MIN);
    // 見出しと箇条書きの記号（`--mx-color-heading`）。
    check('keyword', bg, LARGE_MIN);
    check('keyword', subtle, LARGE_MIN);
    // コードブロックの記法。
    for (const key of ['string', 'number', 'function', 'variable', 'builtin'] as const) {
      check(key, subtle, LARGE_MIN);
    }
    // インラインコード。
    const builtin = side('builtin');
    check('builtin', mix(builtin, bg, CHIP ?? 0), TEXT_MIN, builtin);

    expect(failures).toEqual([]);
  });
});
