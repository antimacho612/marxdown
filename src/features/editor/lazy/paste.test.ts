// @vitest-environment jsdom
/**
 * URL のスマートペーストの回帰テスト（F-EDIT-12 / `paste.ts`）。
 *
 * 貼り付けそのもの（`paste` イベントを捕まえて `preventDefault` する経路）は
 * クリップボードが要るので E2E の担当。**ここで見るのは判定と組み立て**で、
 * 「何を URL と見なすか」を緩めたときに気づけるようにしてある。
 */
import { describe, expect, it } from 'vitest';

import { run } from '../../../../tests/editor-harness';
import { isPastedUrl, linkFromUrl } from './paste';

describe('URL の判定', () => {
  it('スキームと // を持つ 1 行だけを通す', () => {
    expect(isPastedUrl('https://example.com/a')).toBe(true);
    expect(isPastedUrl('  https://example.com  ')).toBe(true);
  });

  /**
   * **迷う入力は通さない。** ここを緩めると、ただの文字列を貼っただけで
   * リンクにされて驚くことになる（Principle 3）。
   */
  it('URL でないものは通さない', () => {
    expect(isPastedUrl('ただの文字列')).toBe(false);
    expect(isPastedUrl('example.com')).toBe(false);
    expect(isPastedUrl('mailto:a@example.com')).toBe(false);
    expect(isPastedUrl('https://example.com これも入っている')).toBe(false);
    expect(isPastedUrl('https://example.com\nhttps://example.org')).toBe(false);
  });
});

describe('選択範囲をリンクにする', () => {
  it('選択がリンクテキストになり、カーソルは後ろへ', () => {
    expect(run(linkFromUrl('https://example.com'), 'これは |Marxdown| です')).toBe(
      'これは [Marxdown](https://example.com)| です',
    );
  });
});
