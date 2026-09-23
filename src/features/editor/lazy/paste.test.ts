// @vitest-environment jsdom
/**
 * URL のスマートペーストの回帰テスト（F-EDIT-12 / `paste.ts`）。
 *
 * 貼り付けそのもの（`paste` イベントを受け取って `preventDefault` する経路）はクリップボードを必要とするため、ここでは扱わない。
 * ここでは判定と組み立てを検証し、「何を URL と見なすか」「何を画像と見なすか」の条件を緩めたときに検出できるようにする。
 *
 * 画像を実際に書き込む側は Rust のテスト（`src-tauri/src/asset.rs`）が検証する。
 */
import { describe, expect, it } from 'vitest';

import { run } from '../../../../tests/editor-harness';
import { imageInClipboard, imageLink, isPastedUrl, linkFromUrl } from './paste';

describe('URL の判定', () => {
  it('スキームと // を持つ 1 行だけを通す', () => {
    expect(isPastedUrl('https://example.com/a')).toBe(true);
    expect(isPastedUrl('  https://example.com  ')).toBe(true);
  });

  /**
   * 判定が曖昧な入力は通さない。
   * 条件を緩めると、ただの文字列を貼り付けただけでリンクに変換されてしまう（Principle 3）。
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

describe('画像のリンクを組み立てる (F-EDIT-13)', () => {
  it('カーソル位置に挿入し、カーソルは後ろへ', () => {
    expect(run(imageLink('spec.md.assets/paste-1.png'), '本文|')).toBe('本文![](spec.md.assets/paste-1.png)|');
  });

  it('選択があれば代替テキストにする', () => {
    // URL のスマートペーストと同じ扱いである。
    expect(run(imageLink('a.assets/b.png'), '|図の説明|')).toBe('![図の説明](a.assets/b.png)|');
  });
});

describe('クリップボードから画像を取り出す (F-EDIT-13)', () => {
  /** `DataTransfer` は jsdom に無いため、`files` だけを持つ最小の形を渡す。 */
  function clipboard(...files: { type: string }[]): DataTransfer {
    return { files } as unknown as DataTransfer;
  }

  it.each([
    ['image/png', 'png'],
    ['image/jpeg', 'jpg'],
    ['image/gif', 'gif'],
    ['image/webp', 'webp'],
    ['IMAGE/PNG', 'png'],
  ])('%s を %s として拾う', (type, extension) => {
    expect(imageInClipboard(clipboard({ type }))?.extension).toBe(extension);
  });

  it('SVG は拾わない', () => {
    // 中身が実行可能なマークアップであり、Rust 側も受け付けない（`src-tauri/src/asset.rs`）。
    expect(imageInClipboard(clipboard({ type: 'image/svg+xml' }))).toBeNull();
  });

  it('画像以外は拾わない', () => {
    expect(imageInClipboard(clipboard({ type: 'text/plain' }))).toBeNull();
    expect(imageInClipboard(clipboard())).toBeNull();
    expect(imageInClipboard(null)).toBeNull();
  });

  it('画像とテキストが同時に入っていても画像を選ぶ', () => {
    // 画像を貼ったときのクリップボードには、ファイル名などのテキストが同時に入っていることがある。
    expect(imageInClipboard(clipboard({ type: 'text/plain' }, { type: 'image/png' }))?.extension).toBe('png');
  });
});
