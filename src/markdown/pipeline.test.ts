import { describe, expect, it } from 'vitest';

import { render, renderChunks, slugifyHeading } from './pipeline';
import { splitFrontMatter } from './plugins/front-matter';

describe('CommonMark / GFM', () => {
  it('見出しと段落を描画する', () => {
    const { html } = render('# 見出し\n\n本文です。\n');
    expect(html).toContain('<h1');
    expect(html).toContain('見出し');
    expect(html).toContain('<p');
  });

  it('GFM のテーブルを描画する', () => {
    const { html } = render('| a | b |\n| --- | --- |\n| 1 | 2 |\n');
    expect(html).toContain('<table');
    expect(html).toContain('<th');
  });

  it('GFM の取り消し線を描画する', () => {
    expect(render('~~消した~~').html).toContain('<s>');
  });

  it('linkify で裸の URL をリンクにする', () => {
    expect(render('see https://example.com/ ok').html).toContain('<a href="https://example.com/"');
  });

  it('breaks: false なので単独の改行を <br> にしない', () => {
    // CommonMark 準拠。ここを true にすると LLM 生成の折り返しが全部改行になる。
    expect(render('a\nb').html).not.toContain('<br>');
  });

  it('typographer: false なので記号を勝手に変換しない', () => {
    expect(render('(c) -- ...').html).toContain('(c) -- ...');
  });
});

describe('data-line 行マッピング (02.architecture/06-markdown-rendering-pipeline.md §3)', () => {
  it('ブロック要素に開始行を付ける', () => {
    const { html } = render('# h\n\npara\n\n- item\n');
    expect(html).toContain('data-line="0"'); // 見出し
    expect(html).toContain('data-line="2"'); // 段落
    expect(html).toContain('data-line="4"'); // リスト
  });

  it('コードフェンスにも付ける', () => {
    const { html } = render('text\n\n```ts\nconst a = 1\n```\n');
    expect(/<pre[^>]*data-line="2"/.test(html)).toBe(true);
  });

  it('Front Matter があっても元テキストの行番号を指す', () => {
    const { html } = render('---\ntitle: x\n---\n# 見出し\n');
    // Front Matter は 0..2 行目。見出しは元テキストの 3 行目。
    expect(html).toContain('data-line="3"');
  });

  it('インライン要素には付けない（数が爆発するため）', () => {
    const { html } = render('**a** *b* `c`\n');
    expect(html.match(/data-line=/g)).toHaveLength(1); // 段落の 1 つだけ
  });
});

describe('アウトライン抽出', () => {
  it('見出しをレベル・行番号つきで返す', () => {
    const { outline } = render('# a\n\n## b\n\n### c\n');
    expect(outline.map((h) => [h.level, h.text, h.line])).toEqual([
      [1, 'a', 0],
      [2, 'b', 2],
      [3, 'c', 4],
    ]);
  });

  it('見出しに id が付く', () => {
    const { outline } = render('# Hello World\n');
    expect(outline[0]?.slug).toBe('hello-world');
  });

  it('日本語の見出しはそのまま slug になる（GitHub と同じ）', () => {
    expect(slugifyHeading('設計 ドキュメント')).toBe('設計-ドキュメント');
  });

  it('記号は slug から落とす', () => {
    expect(slugifyHeading('a.b, c!')).toBe('ab-c');
  });
});

describe('Front Matter の分離 (F-VIEW-09)', () => {
  it('先頭の --- ブロックを切り離す', () => {
    const r = splitFrontMatter('---\ntitle: x\ntags: [a]\n---\n# 本文\n');
    expect(r.frontMatter).toBe('title: x\ntags: [a]');
    expect(r.body).toBe('# 本文\n');
    expect(r.bodyStartLine).toBe(4);
  });

  it('--- が無ければ何もしない', () => {
    const r = splitFrontMatter('# 本文\n');
    expect(r.frontMatter).toBeNull();
    expect(r.bodyStartLine).toBe(0);
  });

  it('閉じられていない --- は Front Matter 扱いしない', () => {
    // LLM の出力が途中で切れたケース。本文が丸ごと消えるほうが害が大きい。
    const text = '---\ntitle: x\n\n# 本文\n';
    const r = splitFrontMatter(text);
    expect(r.frontMatter).toBeNull();
    expect(r.body).toBe(text);
  });

  it('--- 単独の水平線を Front Matter と誤認しない', () => {
    const r = splitFrontMatter('本文\n\n---\n\nつづき\n');
    expect(r.frontMatter).toBeNull();
  });

  it('... で閉じる YAML も受け付ける', () => {
    const r = splitFrontMatter('---\na: 1\n...\n# 本文\n');
    expect(r.frontMatter).toBe('a: 1');
  });

  it('render が Front Matter を本文から外す', () => {
    const { html, frontMatter } = render('---\ntitle: x\n---\n# 見出し\n');
    expect(frontMatter).toBe('title: x');
    expect(html).not.toContain('title: x');
  });
});

describe('段階的描画のチャンク分割 (N-PERF-04)', () => {
  const many = Array.from({ length: 120 }, (_, i) => `## 見出し ${i}\n\n段落 ${i}\n`).join('\n');

  it('最初のチャンクが指定ブロック数で切れる', () => {
    const { chunks } = renderChunks(many, 10, 50);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('チャンクを連結すると分割なしの結果と一致する', () => {
    // 要素の途中で切れていないことの検証。ここが崩れると HTML が壊れる。
    const joined = renderChunks(many, 10, 50).chunks.join('');
    expect(joined).toBe(render(many).html);
  });

  it('小さいドキュメントは 1 チャンクに収まる', () => {
    expect(renderChunks('# a\n\nb\n', 40, 200).chunks).toHaveLength(1);
  });

  it('空のドキュメントでも落ちない', () => {
    expect(renderChunks('', 40, 200).chunks.join('')).toBe('');
  });

  it('チャンク分割してもアウトラインは全体ぶん返る', () => {
    expect(renderChunks(many, 10, 50).outline).toHaveLength(120);
  });
});

describe('壊れた入力に耐える (N-REL-04)', () => {
  it.each([
    ['閉じないコードフェンス', '```ts\nconst a = 1\n'],
    ['閉じない強調', '**強調したまま'],
    ['深いネスト', '> '.repeat(50) + 'text'],
    ['閉じない HTML', '<div><span>text'],
    ['列数が合わない表', '| a | b |\n| --- |\n| 1 | 2 | 3 |'],
    ['NUL を含む', 'a\0b'],
  ])('%s でも落ちない', (_name, input) => {
    expect(() => render(input)).not.toThrow();
  });
});
