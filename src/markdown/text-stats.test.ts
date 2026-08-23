import { describe, expect, it } from 'vitest'

import { measure } from './text-stats'

describe('文字数と読了時間 (03.ux-spec.md §8.3)', () => {
  it('空白を数に入れない', () => {
    expect(measure('a b\tc\nd').chars).toBe(4)
  })

  it('英数字の語を数える', () => {
    expect(measure('the quick brown fox').words).toBe(4)
  })

  it('ハイフンとアポストロフィで語を割らない', () => {
    expect(measure("don't well-known").words).toBe(2)
  })

  it('日本語は語ではなく文字で数える', () => {
    const stats = measure('これは日本語の文章です。')
    expect(stats.words).toBe(0)
    expect(stats.chars).toBe(12)
  })

  it('日本語と英語が混ざっても数えられる', () => {
    const stats = measure('Marxdown は Markdown を速く開くツールです')
    expect(stats.words).toBe(2) // Marxdown / Markdown
    expect(stats.chars).toBeGreaterThan(2)
  })

  it('空の本文は 0 分', () => {
    expect(measure('')).toEqual({ chars: 0, words: 0, readingMinutes: 0 })
    expect(measure('   \n\t ').readingMinutes).toBe(0)
  })

  it('短い本文でも 0 分にはしない', () => {
    // 「約 0 分」は情報として無意味
    expect(measure('a').readingMinutes).toBe(1)
  })

  it('長い日本語ほど読了時間が伸びる', () => {
    const short = measure('あ'.repeat(450))
    const long = measure('あ'.repeat(4500))
    expect(short.readingMinutes).toBe(1)
    expect(long.readingMinutes).toBe(10)
  })

  it('英語は語数で見積もる', () => {
    // 220 語 ≒ 1 分
    expect(measure('word '.repeat(220)).readingMinutes).toBe(1)
    expect(measure('word '.repeat(2200)).readingMinutes).toBe(10)
  })
})
