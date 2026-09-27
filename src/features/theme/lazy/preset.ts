/**
 * 組み込み配色の型と CSS への変換（ADR-0014 / `theme` チャンク）。
 *
 * データを CSS ではなく TypeScript で持つのは 2 つの理由による。
 * 1 つは `[data-mx-editor-theme='...']` というセレクタと `--mx-color-*` という変数名を 50 回書き写さずに済むこと。
 * もう 1 つは、キーの過不足を型検査で検出できること。
 * 手で書いた 50 枚の配色のうち 1 枚だけ変数が欠けている状態は、実行するまで気づけない。
 */

/**
 * 配色が上書きするトークン。
 *
 * `tokens.css` の `--mx-color-*` から接頭辞を除いた名前にしてある。
 * 上書きの範囲は ADR-0013 §3.3 の 18 個である。
 * `--mx-color-danger` のような意味を持つ色は配色では動かさない。
 */
export type TokenKey =
  | 'bg'
  | 'bgSubtle'
  | 'bgInset'
  | 'bgHover'
  | 'fg'
  | 'fgMuted'
  | 'fgSubtle'
  | 'border'
  | 'borderSubtle'
  | 'accent'
  | 'comment'
  | 'keyword'
  | 'string'
  | 'number'
  | 'function'
  | 'variable'
  | 'builtin';

/** `TokenKey` から実際の変数名への対応。並びは `tokens.css` と同じ。 */
const TOKENS: Record<TokenKey, string> = {
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

/**
 * ライトとダークの両方を持つ配色。値は `[ライト, ダーク]` で、`light-dark()` として出力される。
 *
 * 明暗を決めるのは `theme` 設定だけで、この形の配色はどちらにも追従する（ADR-0013 §3.2）。
 */
export interface PairPreset {
  label: string;
  scheme?: undefined;
  /** 出典。本家に無い組み合わせを含む場合はその旨も書く。 */
  origin: string;
  colors: Record<TokenKey, readonly [light: string, dark: string]>;
}

/**
 * 明暗のどちらか一方しか持たない配色。面に `color-scheme` を固定する（ADR-0014 §3.2）。
 *
 * Dracula や Monokai のようにライト版が存在しない配色を、本家に無い変種を作らずに含めるための形である。
 * `theme` 設定がライトでも、この配色を選んだエディターだけは指定した側で表示される。
 */
export interface PinnedPreset {
  label: string;
  scheme: 'light' | 'dark';
  origin: string;
  colors: Record<TokenKey, string>;
}

/** 組み込み配色 1 枚。 */
export type Preset = PairPreset | PinnedPreset;

/**
 * 選択の一覧に出す情報。色は含まない。
 *
 * 設定 UI は 50 枚ぶんの色を必要としない。
 * 一覧のために配色全体を渡すと、選択肢を描くだけで全色が参照されることになる。
 */
export interface ThemeSummary {
  id: string;
  label: string;
  /** `undefined` はライトとダークの両方を持つことを表す。 */
  scheme?: 'light' | 'dark';
  /** ユーザーが `themes/` に置いたファイル由来か。同名なら組み込みより優先される。 */
  user: boolean;
}

/**
 * 配色 1 枚を宣言の並びにする。セレクタは含まない。
 *
 * `--mx-color-selection` は accent から導出する。
 * 50 枚ぶんを手で書くと、accent と整合しない値が混入する余地だけが増える。
 */
export function declarations(preset: Preset): string {
  const lines: string[] = [];
  if (preset.scheme !== undefined) lines.push(`color-scheme:${preset.scheme};`);

  for (const [key, name] of Object.entries(TOKENS)) {
    const value = preset.colors[key as TokenKey];
    lines.push(`${name}:${typeof value === 'string' ? value : `light-dark(${value[0]},${value[1]})`};`);
  }

  lines.push(`--mx-color-selection:color-mix(in srgb,var(--mx-color-accent) 32%,transparent);`);
  return lines.join('');
}
