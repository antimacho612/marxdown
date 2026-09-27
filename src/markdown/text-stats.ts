/**
 * 文字数と読了時間の見積もり。
 *
 * 本文を保持しているパイプライン側で数え、派生値だけをストアへ渡す（ADR-0005）。
 * 日本語には単語の自然な区切りが無く、形態素解析は Principle 8 に照らして採用できないため、英語は語数、日本語は文字数で数える。
 */

/** CJK 統合漢字・ひらがな・カタカナ・全角句読点。 */
const CJK = /[぀-ゟ゠-ヿ㐀-䶿一-鿿豈-﫿　-〿＀-￯]/;

/** 英数字の語。 */
const LATIN_WORD = /[A-Za-z0-9][A-Za-z0-9'’-]*/g;

/**
 * 読む速さ。日本語は 1 分あたりの文字数、英語は 1 分あたりの語数で表す。
 * 一般的な黙読速度のうち控えめな値を採用する。
 * 表示するのは目安であるため、短く見積もるより長めに見積もる。
 */
const CJK_PER_MINUTE = 450;
const LATIN_WORDS_PER_MINUTE = 220;

/** 文字数と読了時間。ステータスバーが表示する派生値。 */
export interface TextStats {
  /** 空白を除いた文字数。 */
  chars: number;
  /** 英数字の語数。 */
  words: number;
  /** 読了時間の目安（分）。0 にはならない。 */
  readingMinutes: number;
}

/**
 * 本文テキストから見積もる。
 *
 * Markdown の記法（`#` や `**`）も文字数に含める。
 * 除外するにはレンダリング結果を保持する必要があり、この指標にそこまでの精度は求めない。
 */
export function measure(text: string): TextStats {
  let cjk = 0;
  let chars = 0;

  for (const ch of text) {
    if (/\s/.test(ch)) continue;
    chars++;
    if (CJK.test(ch)) cjk++;
  }

  const words = text.match(LATIN_WORD)?.length ?? 0;

  const minutes = cjk / CJK_PER_MINUTE + words / LATIN_WORDS_PER_MINUTE;
  const readingMinutes = chars === 0 ? 0 : Math.max(1, Math.round(minutes));

  return { chars, words, readingMinutes };
}
