/**
 * Marp の自作テーマ（`marp.themes` / ADR-0023 §3.4）の読み込み。
 *
 * 読み込むのは Marp の文書を描くときだけである（`markdown/parser.ts` が `ParseOptions.marpThemes` を呼ぶ）。
 * 設定が変わらない間は結果を使い回し、Split の打鍵ごとにファイルを読まない。
 * 文書を開くときと再読み込み（F5）では読み直す。外部で編集したテーマはそこで反映される。
 */
import type { MarpThemeSet } from '@/markdown/protocol';
import { getPlatform } from '@/platform';

const NO_THEMES: MarpThemeSet = { themes: [], problems: [] };

let cached: { key: string; pending: Promise<MarpThemeSet> } | null = null;

/**
 * `paths` のテーマを読む。
 *
 * 同じ `paths` の間は同じ結果（同じオブジェクト）を返すため、`markdown/marp.ts` は登録し直さない。
 * `fresh` のときはファイルを読み直す。
 */
export function loadMarpThemes(paths: readonly string[], fresh = false): Promise<MarpThemeSet> {
  if (paths.length === 0) return Promise.resolve(NO_THEMES);

  const key = paths.join('\n');
  if (fresh || cached?.key !== key) cached = { key, pending: read(paths) };
  return cached.pending;
}

async function read(paths: readonly string[]): Promise<MarpThemeSet> {
  try {
    return await getPlatform().readMarpThemes(paths);
  } catch {
    // NOTE: 読み込みそのものの失敗で本文を描けなくしない。組み込みのテーマで描く。
    return NO_THEMES;
  }
}
