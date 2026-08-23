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
import { requestIdle, type IdleDeadline } from '@/lib/idle'
import { sanitize } from '@/markdown/sanitize'

export interface PaintResult {
  /** 最初のチャンクが入った時刻（performance.now()）。 */
  firstChunkAt: number
  /** すべてのチャンクが入ったら解決する。 */
  done: Promise<number>
}

/**
 * チャンク列を container に描画する。
 *
 * 最初のチャンクは**同期的に**入れる。ここを非同期にすると
 * 「読める最初のフレーム」が 1 フレーム遅れる。
 */
export function paint(
  container: HTMLElement,
  chunks: string[],
  frontMatter: string | null = null,
): PaintResult {
  container.replaceChildren()

  // Front Matter は本文と一緒にスクロールするため、プレビューの中に入れる（F-VIEW-09）。
  // textContent で入れるので、中身がどんな文字列でもここから HTML にはならない。
  if (frontMatter !== null) {
    const pre = document.createElement('pre')
    pre.className = 'mx-front-matter'
    pre.textContent = frontMatter
    container.append(pre)
  }

  const first = chunks[0]
  if (first === undefined) {
    const firstChunkAt = performance.now()
    return { firstChunkAt, done: Promise.resolve(firstChunkAt) }
  }

  // 本文幅の基準点（`.mx-content`）を 1 箇所に絞る。見出しごとに font-size が
  // 違っても、`ch` はここでしか計算されないので列幅がずれない（Issue #4）。
  const content = document.createElement('div')
  content.className = 'mx-content'
  container.append(content)
  content.append(toFragment(first))
  const firstChunkAt = performance.now()

  const rest = chunks.slice(1)
  if (rest.length === 0) {
    return { firstChunkAt, done: Promise.resolve(firstChunkAt) }
  }

  const done = new Promise<number>((resolve) => {
    let index = 0
    const step = (deadline: IdleDeadline) => {
      // 1 回のアイドルで入れられるだけ入れる。1 チャンクずつだと
      // huge.md で idle コールバックの往復回数が支配的になる。
      do {
        const chunk = rest[index]
        if (chunk === undefined) break
        content.append(toFragment(chunk))
        index++
      } while (index < rest.length && (deadline.timeRemaining() > 4 || deadline.didTimeout))

      if (index < rest.length) requestIdle(step)
      else resolve(performance.now())
    }
    requestIdle(step)
  })

  return { firstChunkAt, done }
}

/**
 * サニタイズ済み HTML を DocumentFragment にする。
 *
 * `innerHTML +=` を繰り返すと、既存の DOM が毎回捨てられて作り直される。
 * `<template>` 経由でパースしてから append することで、追記が O(追加分) になる。
 */
function toFragment(html: string): DocumentFragment {
  const template = document.createElement('template')
  template.innerHTML = sanitize(html)
  return template.content
}
