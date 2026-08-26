/**
 * 本文を DOM に入れる（02.architecture.md §6.4）。
 *
 * 仮想スクロールは採用しない。理由は §6.4:
 * ブラウザ内検索 / アンカーリンク / 印刷が壊れ、高さ推定の精度も出ない。
 * 代わりに**段階的描画**で N-PERF-04 を満たす。
 *
 * ```text
 * 1. 最初のチャンク（およそ 1 画面分）だけを即座に DOM へ入れる
 * 2. 残りは requestIdleCallback で順次追加
 * ```
 */
import { requestIdle, type IdleDeadline } from '@/lib/idle';
import { sanitize } from '@/markdown/sanitize';

export interface PaintResult {
  /** 最初のチャンクが入った時刻（performance.now()）。 */
  firstChunkAt: number;
  /**
   * すべてのチャンクが入ったら解決する。
   *
   * **打ち切られた場合は解決しない。** 次の `paint()` が始まった時点で
   * 前の描画は意味を失っており、そこに続きを繋げる呼び出し側は居ない。
   */
  done: Promise<number>;
}

/**
 * 実行中の段階的描画（OQ-18）。
 *
 * # なぜこれが要るのか
 *
 * `paint()` は残りのチャンクを `requestIdle` で少しずつ入れる。
 * **この途中で次のファイルを開くと、古いループが止まらない。**
 *
 * 止まらないループが握り続けるものは 2 つある。
 *
 * 1. `rest`（未投入のチャンク文字列）。`huge.md`（2MB）では**これ自体が数 MB**
 * 2. `content`（投入先の要素）。次の `paint()` が `replaceChildren()` を
 *    呼んだ時点で **DOM から切り離されている**が、ループはそこへ追記し続ける
 *
 * つまり「もう誰も見ていない DOM ツリーを、裏で作り続ける」ことになる。
 * 作り終えるまで解放されず、作っている間は CPU も食う。
 *
 * **M3 でタブが入ると、これがタブの枚数だけ並ぶ。** N-PERF-06
 * 「タブを閉じたときのリソース解放」は、まずここが止まることが前提になる。
 */
let running: { cancelled: boolean } | null = null;

/**
 * 実行中の段階的描画を打ち切る。
 *
 * `paint()` の冒頭が呼ぶので、通常は呼び出し側が意識しなくてよい。
 * **本文を捨てるだけで描き直さない**場面（タブを閉じる / M3）のために公開する。
 */
export function cancelPaint(): void {
  if (running) running.cancelled = true;
  running = null;
}

/**
 * チャンク列を container に描画する。
 *
 * 最初のチャンクは**同期的に**入れる。ここを非同期にすると
 * 「読める最初のフレーム」が 1 フレーム遅れる。
 */
export function paint(container: HTMLElement, chunks: string[], frontMatter: string | null = null): PaintResult {
  // **前の描画を先に止める。** ここを忘れると、古いループが切り離された
  // ツリーへ追記し続ける（`running` のコメント参照 / OQ-18）。
  cancelPaint();
  container.replaceChildren();

  // Front Matter は本文と一緒にスクロールするため、プレビューの中に入れる（F-VIEW-09）。
  // textContent で入れるので、中身がどんな文字列でもここから HTML にはならない。
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

  // 本文幅の基準点（`.mx-content`）を 1 箇所に絞る。見出しごとに font-size が
  // 違っても、`ch` はここでしか計算されないので列幅がずれない。
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
      // 打ち切られたら、その場で手を離す。**解決もしない。**
      //
      // ここで `resolve` すると、呼び出し側（`open.ts`）の `.then` が走り、
      // 切り離されたコンテナに対して `enhance` とアンカー復元をやり直す。
      // 「もう誰も見ていない DOM を整える」ぶんだけ仕事が増える。
      if (token.cancelled) return;

      // 1 回のアイドルで入れられるだけ入れる。1 チャンクずつだと
      // huge.md で idle コールバックの往復回数が支配的になる。
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
      // 最後まで入った。**自分が現役のときだけ**現役の座を空ける
      // （既に次の `paint()` が始まっていたら、そちらを消してはいけない）。
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
 * `innerHTML +=` を繰り返すと、既存の DOM が毎回捨てられて作り直される。
 * `<template>` 経由でパースしてから append することで、追記が O(追加分) になる。
 */
function toFragment(html: string): DocumentFragment {
  const template = document.createElement('template');
  template.innerHTML = sanitize(html);
  return template.content;
}
