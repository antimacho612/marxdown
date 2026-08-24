/**
 * Markdown Worker のプロトコル。
 *
 * 02.architecture.md §6.2 の制約: **受け渡すのは文字列のみ**。
 * DOM を触る処理（Mermaid / KaTeX / DOMPurify）はメインスレッド側に残す。
 */
import type { OutlineItem } from '../plugins/line-map';
import type { TextStats } from '../text-stats';

export interface ParseRequest {
  type: 'parse';
  id: number;
  text: string;
  firstChunkBlocks: number;
  chunkBlocks: number;
}

export interface ParseResponse {
  type: 'parsed';
  id: number;
  /**
   * トップレベルのブロック境界で割った HTML。
   * 割れない入力（10MB の単一コードフェンスなど）では要素 1 つになる。
   */
  chunks: string[];
  outline: OutlineItem[];
  frontMatter: string | null;
  /** Worker 内部のパース所要時間（ms）。S3 の計測に使う。 */
  parseMs: number;
  /** 文字数と読了時間（03.ux-spec.md §8.3）。本文を持っている側で数える。 */
  textStats: TextStats;
}

export interface ErrorResponse {
  type: 'error';
  id: number;
  message: string;
}

export type WorkerRequest = ParseRequest;
export type WorkerResponse = ParseResponse | ErrorResponse;

/** 段階的描画の既定値。最初のチャンクがおよそ 1 画面分になるように選ぶ。 */
export const DEFAULT_FIRST_CHUNK_BLOCKS = 40;
export const DEFAULT_CHUNK_BLOCKS = 200;
