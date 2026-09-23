/**
 * 本文を DOM に入れる（02.architecture/06-markdown-rendering-pipeline.md §4）。
 *
 * 仮想スクロールは採用しない（ブラウザ内検索・アンカーリンク・印刷が壊れ、高さ推定の精度も出ないため）。
 * 代わりに、最初のチャンク（およそ 1 画面分）だけ即座に DOM へ入れ、残りを `requestIdleCallback` で順次追加する段階的描画で N-PERF-04 を満たす。
 */
import { requestIdle, type IdleDeadline } from '@/lib/idle';
import { sanitize } from '@/markdown/sanitize';

/** `paint` の結果。段階的描画の進み具合を呼び出し側へ伝える。 */
export interface PaintResult {
  /** 最初のチャンクが入った時刻（performance.now()）。 */
  firstChunkAt: number;
  /**
   * すべてのチャンクが入ったら解決する。
   *
   * 打ち切られた場合は解決しない。
   * 次の `paint()` が始まった時点で前の描画は不要になっており、続きを処理する呼び出し側も存在しない。
   */
  done: Promise<number>;
}

/**
 * 実行中の段階的描画。
 *
 * `paint()` は残りのチャンクを `requestIdle` で少しずつ入れるため、途中で次のファイルを開くと古いループが止まらない。
 * 未投入のチャンク文字列（`huge.md` で数 MB）と既に DOM から切り離された投入先要素を保持したまま処理を続けることになる。
 * タブを切り替えるたびに古いループが残るため、N-PERF-06 の前提としてここを止める必要がある。
 */
let running: { cancelled: boolean } | null = null;

/**
 * 実行中の段階的描画を打ち切る。
 *
 * `paint()` の冒頭で呼ばれるため、通常は呼び出し側が意識する必要はない。
 * 本文を破棄するだけで再描画しない場面（タブを閉じる）のために公開している。
 */
export function cancelPaint(): void {
  if (running) running.cancelled = true;
  running = null;
}

/**
 * チャンク列を container に描画する。
 *
 * 最初のチャンクは同期的に挿入する。
 * ここを非同期にすると、本文が読める最初のフレームが 1 フレーム遅れる。
 */
export function paint(container: HTMLElement, chunks: string[], frontMatter: string | null = null): PaintResult {
  // 前の描画を先に停止する。
  // 停止しないと、古いループが DOM から切り離されたツリーへ追記し続ける（`running` のコメントを参照）。
  cancelPaint();
  container.replaceChildren();

  // Front Matter は本文と一緒にスクロールするため、プレビューの中に挿入する（F-VIEW-09）。
  // `textContent` で挿入するため、内容がどのような文字列でもここから HTML として解釈されることはない。
  if (frontMatter !== null) {
    const pre = document.createElement('pre');
    pre.className = 'mx-front-matter';
    pre.textContent = frontMatter;
    container.append(pre);
  }

  const first = chunks[0];
  if (first === undefined) {
    const firstChunkAt = performance.now();
    return { firstChunkAt, done: Promise.resolve(firstChunkAt) };
  }

  // 本文幅の基準点（`.mx-content`）を 1 か所に限定する。
  // 見出しごとに font-size が異なっても、`ch` はここでしか計算されないため列幅が変わらない。
  const content = document.createElement('div');
  content.className = 'mx-content';
  container.append(content);
  content.append(toFragment(first));
  const firstChunkAt = performance.now();

  const rest = chunks.slice(1);
  if (rest.length === 0) {
    return { firstChunkAt, done: Promise.resolve(firstChunkAt) };
  }

  const token = { cancelled: false };
  running = token;

  const done = new Promise<number>((resolve) => {
    let index = 0;
    const step = (deadline: IdleDeadline) => {
      // 打ち切られたらその時点で処理を終える。Promise も解決しない。
      //
      // ここで `resolve` すると呼び出し側（`open.ts`）の `.then` が実行され、DOM から切り離されたコンテナに対して `enhance` とアンカーの復元を再度実行することになる。
      if (token.cancelled) return;

      // 1 回のアイドルで可能な限り挿入する。
      // 1 チャンクずつ処理すると、`huge.md` では idle コールバックの往復回数が支配的になる。
      do {
        const chunk = rest[index];
        if (chunk === undefined) break;
        content.append(toFragment(chunk));
        index++;
      } while (index < rest.length && (deadline.timeRemaining() > 4 || deadline.didTimeout));

      if (index < rest.length) {
        requestIdle(step);
        return;
      }
      // すべて挿入し終えた。
      // 自分が実行中の描画である場合にだけ `running` を解除する（既に次の `paint()` が始まっていれば、そちらを解除してはいけない）。
      if (running === token) running = null;
      resolve(performance.now());
    };
    requestIdle(step);
  });

  return { firstChunkAt, done };
}

/**
 * サニタイズ済み HTML を DocumentFragment にする。
 *
 * `innerHTML +=` を繰り返すと、既存の DOM が毎回破棄されて作り直される。
 * `<template>` 経由でパースしてから append することで、追記が O(追加分) になる。
 */
function toFragment(html: string): DocumentFragment {
  const template = document.createElement('template');
  template.innerHTML = sanitize(html);
  return template.content;
}
