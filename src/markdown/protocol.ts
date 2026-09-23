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
  outline: OutlineItem[];
  frontMatter: string | null;
  /** パース所要時間（ms）。起動計測とベンチに使う。 */
  parseMs: number;
  /** 文字数と読了時間（03.ux-spec/07-status-and-notifications.md §3）。本文を持っている側で数える。 */
  textStats: TextStats;
}

/** 段階的描画の既定値。最初のチャンクがおよそ 1 画面分になるように選ぶ。 */
export const DEFAULT_FIRST_CHUNK_BLOCKS = 40;
export const DEFAULT_CHUNK_BLOCKS = 200;
