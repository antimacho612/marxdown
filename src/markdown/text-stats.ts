/**
 * 文字数と読了時間の見積もり（03.ux-spec/07-status-and-notifications.md §3）。
 *
 * **Worker 側で数える。** 本文テキストを持っているのはここだけで、
 * 数えるためだけにメインスレッドへ巨大な文字列を渡す理由がない（ADR-0005）。
 *
 * # 「words」ではなく「文字数」を出す理由
 *
 * §8.3 のスケッチは `1,240 words` と書いているが、UI 文言は日本語であり
 * 中心ユースケースの本文も日本語が混ざる。日本語に「単語」の自然な区切りは無く、
 * 形態素解析を持ち込むのは Principle 8 に照らして正当化できない。
 * **数えられるものを正直に数える。**
 */

/** CJK 統合漢字・ひらがな・カタカナ・全角句読点。 */
const CJK = /[぀-ゟ゠-ヿ㐀-䶿一-鿿豈-﫿　-〿＀-￯]/;

/** 英数字の語。 */
const LATIN_WORD = /[A-Za-z0-9][A-Za-z0-9'’-]*/g;

/**
 * 読む速さ。日本語は 1 分あたりの**文字数**、英語は 1 分あたりの**語数**。
 * 一般的な黙読速度の控えめな側を採る。表示は「目安」なので、
 * 短く出して裏切るより長めに出すほうがよい。
 */
const CJK_PER_MINUTE = 450;
const LATIN_WORDS_PER_MINUTE = 220;

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
 * Markdown の記法（`#` や `**`）も数に入る。取り除こうとすると
 * レンダリング結果を持ち回る必要があり、そこまでの精度を求める指標ではない。
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
