/**
 * 紹介ページのウィンドウに入れる中身を、ビルド時に作る。
 */
import type { TokenKey } from '@/features/theme/lazy/preset';
import { PRESETS } from '@/features/theme/lazy/presets';
import { measure } from '@/markdown/text-stats';
import tokensCss from '@/styles/tokens.css?raw';

import { samples, type Samples } from '../content/samples';
import type { TreeItem, WindowDoc } from '../lib/window';
import type { Locale } from '../routes';
import { highlightSource, renderMarkdown } from './markdown';

/** 配色の一覧に並べる 1 枚。色は見本の丸に使う分だけを持つ。 */
export interface PresetSwatch {
  id: string;
  label: string;
  /** `both` はライトとダークの両方を持つ。 */
  scheme: 'both' | 'light' | 'dark';
  /** `[ライト, ダーク]`。一方だけの配色は同じ値を 2 つ持つ。 */
  bg: [string, string];
  fg: [string, string];
  accent: [string, string];
  keyword: [string, string];
  string: [string, string];
}

/** バイト列の見本の 1 マス。 */
export interface ByteCell {
  hex: string;
  kind: 'bom' | 'eol' | 'text' | 'target';
}

export interface BytesData {
  /** 表示用の行。改行の記号は描画側で足す。 */
  lines: string[];
  cells: ByteCell[];
  /** 書き換える文字の位置（行・行内の位置）と、書き換え後のバイト。 */
  target: { line: number; column: number; hex: string };
}

export interface LandingData {
  samples: Samples;
  bytes: BytesData;
  hero: WindowDoc[];
  tour: { design: WindowDoc; notes: WindowDoc; tree: TreeItem[]; typedLine: string; alignedLines: string[] };
  themeDoc: WindowDoc;
  typographyDoc: WindowDoc;
  presets: PresetSwatch[];
  /** 既定の配色（Marxdown）の宣言。`tokens.css` のライトとダークの値から作る。 */
  defaultDeclarations: string;
}

async function doc(id: string, name: string, source: string, withLines = false): Promise<WindowDoc> {
  const stats = measure(source);
  return {
    id,
    name,
    html: await renderMarkdown(source),
    ...(withLines && { lines: highlightSource(source.trimEnd()) }),
    chars: stats.chars,
    minutes: stats.readingMinutes,
  };
}

function toTree(paths: readonly string[]): TreeItem[] {
  return paths.map((path) => {
    const folder = path.endsWith('/');
    const segments = path.replace(/\/$/, '').split('/');
    return { path, name: segments.at(-1) ?? path, depth: segments.length - 1, folder };
  });
}

const TOKEN_NAMES: Record<TokenKey, string> = {
  bg: '--mx-color-bg',
  bgSubtle: '--mx-color-bg-subtle',
  bgInset: '--mx-color-bg-inset',
  bgHover: '--mx-color-bg-hover',
  fg: '--mx-color-fg',
  fgMuted: '--mx-color-fg-muted',
  fgSubtle: '--mx-color-fg-subtle',
  border: '--mx-color-border',
  borderSubtle: '--mx-color-border-subtle',
  accent: '--mx-color-accent',
  comment: '--mx-color-code-comment',
  keyword: '--mx-color-code-keyword',
  string: '--mx-color-code-string',
  number: '--mx-color-code-number',
  function: '--mx-color-code-function',
  variable: '--mx-color-code-variable',
  builtin: '--mx-color-code-builtin',
};

/** `tokens.css` の 1 つの規則から、変数の値を取り出す。 */
function readBlock(selector: string): Map<string, string> {
  const start = tokensCss.indexOf(selector);
  const body = tokensCss.slice(tokensCss.indexOf('{', start) + 1, tokensCss.indexOf('\n}', start));
  return new Map(
    Array.from(body.matchAll(/(--mx-[\w-]+):\s*([^;]+);/g), ([, name = '', value = '']) => [name, value.trim()]),
  );
}

/**
 * 既定の配色を、組み込みの配色と同じ形の宣言にする。
 *
 * 既定の配色は `:root` と `[data-theme='dark']` の 2 つの規則で書かれており、`light-dark()` を使っていない。
 * 見本のウィンドウでは外観をサイトと別に切り替えるため、ここで 1 つの宣言にまとめ直す。
 */
function defaultDeclarations(): string {
  const light = readBlock(':root {');
  const dark = readBlock(":root[data-theme='dark'] {");
  return Object.values(TOKEN_NAMES)
    .map(
      (name) =>
        `${name}:light-dark(${light.get(name) ?? 'initial'},${dark.get(name) ?? light.get(name) ?? 'initial'});`,
    )
    .join('');
}

function presetSwatches(defaultLabel: string): PresetSwatch[] {
  const light = readBlock(':root {');
  const dark = readBlock(":root[data-theme='dark'] {");
  const pick = (key: TokenKey): [string, string] => [
    light.get(TOKEN_NAMES[key]) ?? '',
    dark.get(TOKEN_NAMES[key]) ?? '',
  ];

  const fallback: PresetSwatch = {
    id: 'default',
    label: defaultLabel,
    scheme: 'both',
    bg: pick('bg'),
    fg: pick('fg'),
    accent: pick('accent'),
    keyword: pick('keyword'),
    string: pick('string'),
  };

  const builtIn = Object.entries(PRESETS).map(([id, preset]): PresetSwatch => {
    const colors = preset.colors as Record<TokenKey, string | readonly [string, string]>;
    const pair = (key: TokenKey): [string, string] => {
      const value = colors[key];
      return typeof value === 'string' ? [value, value] : [value[0], value[1]];
    };
    return {
      id,
      label: preset.label,
      scheme: 'scheme' in preset && preset.scheme !== undefined ? preset.scheme : 'both',
      bg: pair('bg'),
      fg: pair('fg'),
      accent: pair('accent'),
      keyword: pair('keyword'),
      string: pair('string'),
    };
  });

  return [fallback, ...builtIn];
}

const hex = (byte: number): string => byte.toString(16).toUpperCase().padStart(2, '0');

/**
 * BOM 付き UTF-8・CRLF で保存された文書のバイト列を作る。
 *
 * 書き換えるのは 1 文字（`from` → `to`）だけで、どちらも 1 バイトに収まる文字であることを前提にしている。
 */
function toBytes(lines: readonly string[], from: string, to: string): BytesData {
  const encoder = new TextEncoder();
  const cells: ByteCell[] = [0xef, 0xbb, 0xbf].map((byte) => ({ hex: hex(byte), kind: 'bom' }));
  let target: BytesData['target'] | undefined;

  for (const [index, line] of lines.entries()) {
    const column = target ? -1 : line.indexOf(from);
    for (const [position, char] of [...line].entries()) {
      const kind = column >= 0 && position === Array.from(line.slice(0, column)).length ? 'target' : 'text';
      for (const byte of encoder.encode(char)) cells.push({ hex: hex(byte), kind });
    }
    if (column >= 0)
      target = { line: index, column: Array.from(line.slice(0, column)).length, hex: hex(to.codePointAt(0) ?? 0) };
    if (index < lines.length - 1) cells.push({ hex: '0D', kind: 'eol' }, { hex: '0A', kind: 'eol' });
  }

  return { lines: lines.slice(0, -1), cells, target: target ?? { line: 0, column: 0, hex: '00' } };
}

export async function loadLanding(
  locale: Locale,
  defaultThemeLabel: string,
  bytesEdit: { from: string; to: string },
): Promise<LandingData> {
  const s = samples(locale);
  const design = await doc('design', 'cache-strategy.md', s.design, true);
  const notesSource = `## ${locale === 'ja' ? '比較の結論' : 'Conclusion'}\n\n${
    locale === 'ja' ? `採用するのは ${s.boldTarget} です。` : `We adopt ${s.boldTarget}.`
  }\n\n${s.messyTable}\n`;

  return {
    samples: s,
    bytes: toBytes(s.bytes, bytesEdit.from, bytesEdit.to),
    hero: [
      await doc('architecture', 'architecture.md', s.architecture),
      await doc('research', 'research.md', s.research),
    ],
    tour: {
      design,
      notes: await doc('notes', 'notes.md', notesSource, true),
      tree: toTree(s.tree),
      typedLine: `- [ ] ${s.typed}`,
      alignedLines: highlightSource(s.alignedTable),
    },
    themeDoc: { ...design, id: 'theme' },
    typographyDoc: await doc('typography', 'readability.md', s.typography),
    presets: presetSwatches(defaultThemeLabel),
    defaultDeclarations: defaultDeclarations(),
  };
}
