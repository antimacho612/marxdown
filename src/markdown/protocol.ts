/**
 * パース結果の形と、段階的描画の既定値。
 *
 * かつては Worker との受け渡しの取り決め（`WorkerRequest` / `WorkerResponse`）が
 * ここにあった。**M2 Phase 6 で Worker を畳んだ**ので、境界をまたぐ型ではなくなり、
 * 残ったのは結果の形だけになった（[ADR-0010](../../docs/adr/0010-parse-on-main-thread.md)）。
 */
import type { OutlineItem } from './plugins/line-map';
import type { TextStats } from './text-stats';

export interface ParseResult {
  /** 要求の通し番号。開いた直後に投げたものかを呼び出し側が見分けるために持つ。 */
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
