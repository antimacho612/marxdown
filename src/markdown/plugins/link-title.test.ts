import { describe, expect, it } from 'vitest';

import { render } from '../pipeline';

describe('リンクの title 属性（#144 / plugins/link-title.ts）', () => {
  it('通常のリンクに title を付ける', () => {
    const { html } = render('[タイトル](https://example.com/)');

    expect(html).toContain('<a href="https://example.com/" title="https://example.com/">');
  });

  it('明示的な title があれば上書きしない', () => {
    const { html } = render('[タイトル](https://example.com/ "既存のタイトル")');

    expect(html).toContain('title="既存のタイトル"');
    expect(html).not.toContain('title="https://example.com/"');
  });

  it('オートリンク（<https://~>）には title を付けない', () => {
    const { html } = render('<https://example.com/>');

    expect(html).toContain('<a href="https://example.com/">');
    expect(html).not.toContain('title=');
  });

  it('linkify による裸の URL には title を付けない', () => {
    const { html } = render('see https://example.com/ ok');

    expect(html).toContain('<a href="https://example.com/">');
    expect(html).not.toContain('title=');
  });
});
