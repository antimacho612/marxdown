/**
 * Marp の文書を描く入口（F-VIEW-17 / ADR-0023）。
 *
 * スライドを組み立てる処理は遅延チャンク（`lazy/marp.ts`）にあり、`marp: true` の文書を開くまで読み込まない。
 * 段階的描画と差分更新（`paint.ts`）は使わない。スライドは 1 回の描画ですべて入れ直す。
 */
import type { MarpRender } from '@/markdown/protocol';

import { paint, type PaintResult } from './paint';

/** `paintMarp` の結果。 */
export interface MarpPaintResult extends PaintResult {
  /** 通知バーに出す文言（`lazy/marp.ts` の `MountResult`）。 */
  notice: string | null;
}

/** ロード済みの遅延チャンクの解放関数。`main` から遅延チャンクを静的に辿らせないため、関数だけを保持する。 */
let disposeView: (() => void) | null = null;

/**
 * スライドを `container` に描く。前の本文は外す。
 *
 * スクロール位置は呼び出し側が扱う（開く経路は復元し、打鍵ごとの再描画は保つ）。
 */
export async function paintMarp(container: HTMLElement, marp: MarpRender, baseDir: string): Promise<MarpPaintResult> {
  const { mountMarp, disposeMarp } = await import('./lazy/marp');
  disposeView = disposeMarp;

  // 空のチャンク列で描くと、段階的描画の打ち切りと差分更新の基準の破棄も行われる。
  paint(container, []);
  const { notice } = mountMarp(container, marp, baseDir);
  const firstChunkAt = performance.now();
  return { firstChunkAt, done: Promise.resolve(firstChunkAt), notice };
}

/** 遅延チャンクが保持しているもの（背景画像の解決結果とテーマの判定結果）を解放する（N-PERF-06）。 */
export function releaseMarp(): void {
  disposeView?.();
}
