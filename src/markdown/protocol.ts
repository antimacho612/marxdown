/**
 * パース結果の形と、段階的描画の既定値。
 */
import type { OutlineItem } from './plugins/line-map';
import type { TextStats } from './text-stats';

/** パースの結果。段階的描画に必要な情報と派生値をまとめて返す。 */
export interface ParseResult {
  /** 要求の通し番号。開いた直後に開始したパースの結果かを呼び出し側が見分けるために持つ。 */
  id: number;
  /**
   * トップレベルのブロック境界で割った HTML。
   * 割れない入力（10MB の単一コードフェンスなど）では要素 1 つになる。
   */
  chunks: string[];
  /**
   * 差分更新の単位で割った HTML（`renderChunks` の説明）。
   * 連結すると `chunks` の連結と一致する。
   */
  blocks: string[];
  outline: OutlineItem[];
  frontMatter: string | null;
  /** パース所要時間（ms）。起動計測とベンチに使う。 */
  parseMs: number;
  /** 文字数と読了時間（03.ux-spec/07-status-and-notifications.md §3）。本文を持っている側で数える。 */
  textStats: TextStats;
  /**
   * Marp の文書（Front Matter に `marp: true`）のときの描画結果（F-VIEW-17 / ADR-0023）。
   *
   * このとき `chunks` と `blocks` は空で、本文は `features/preview/marp.ts` が描く。
   */
  marp?: MarpRender;
}

/** Marp の文書の描画結果。HTML はサニタイズしていない。 */
export interface MarpRender {
  /** スライドごとの HTML。1 枚が `<svg data-marpit-svg>` 1 つにあたる。 */
  slides: string[];
  /** テーマと文書中の `<style>` をまとめた CSS。Marpit がスライドの中へ閉じ込めてある。 */
  css: string;
  outline: OutlineItem[];
  /**
   * 自作テーマ（`marp.themes`）のうち、登録できなかったもの。
   *
   * テーマを読み直したときだけ入る。打鍵ごとの再描画で同じ通知を繰り返さないためである。
   */
  themeProblems?: MarpThemeProblem[];
}

/** Marp の自作テーマの読み込み結果（`platform` の `MarpThemes` と同じ形）。 */
export interface MarpThemeSet {
  themes: { path: string; css: string }[];
  problems: MarpThemeProblem[];
}

/**
 * 自作テーマを登録できなかった理由。
 *
 * `no-theme-name` 以外は Rust 側が読むときに判定する（`src-tauri/src/marp_themes.rs`）。
 * `no-theme-name` は `/* @theme 名前 *\/` が無く、marp-core が登録を拒んだものである。
 */
export interface MarpThemeProblem {
  path: string;
  kind: 'not-absolute' | 'missing' | 'not-css' | 'too-large' | 'too-many' | 'unreadable' | 'no-theme-name';
}

/** 段階的描画の既定値。最初のチャンクがおよそ 1 画面分になるように選ぶ。 */
export const DEFAULT_FIRST_CHUNK_BLOCKS = 40;
export const DEFAULT_CHUNK_BLOCKS = 200;

/**
 * `data-line` 属性を持つ開始タグで始まる HTML か。`ParseResult.blocks` の境界の判定に使う。
 *
 * 描画側（`features/preview/paint.ts`）は「トップレベルで `data-line` 属性を持つ要素」を境界とみなして DOM と `blocks` を対応付けるため、両者で同じ判定を使う。
 */
export const LINE_HEAD = /^<[a-z][^\s/>]*\s[^>]*?\bdata-line[\s=/>]/i;
