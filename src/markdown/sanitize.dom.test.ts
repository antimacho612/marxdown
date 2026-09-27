// @vitest-environment jsdom
/**
 * サニタイズの回帰テスト（ADR-0006 / N-SEC-01）。
 *
 * 中心ユースケースが「LLM が生成した、自分が書いていないファイルを開く」である以上、ここは攻撃者が書いた Markdown を前提に書く。
 */
import { describe, expect, it } from 'vitest';

import { render } from './pipeline';
import { sanitize } from './sanitize';

/** 実際の経路と同じ順序で通す（markdown-it → DOMPurify）。 */
function pipeline(markdown: string): string {
  return sanitize(render(markdown).html);
}

describe('スクリプト実行経路を塞ぐ', () => {
  it('script タグを落とす', () => {
    expect(pipeline('<script>alert(1)</script>')).not.toContain('<script');
  });

  it('iframe を落とす', () => {
    expect(pipeline('<iframe src="https://evil.example"></iframe>')).not.toContain('<iframe');
  });

  it('object / embed を落とす', () => {
    const out = pipeline('<object data="x"></object><embed src="y">');
    expect(out).not.toContain('<object');
    expect(out).not.toContain('<embed');
  });

  it('form を落とす', () => {
    expect(pipeline('<form action="https://evil.example"><input name="a"></form>')).not.toContain('<form');
  });

  it('on* 属性を落とす', () => {
    const out = pipeline('<img src="x.png" onerror="alert(1)">');
    expect(out).not.toContain('onerror');
  });

  it('Markdown 記法の javascript: リンクはリンクにすらならない', () => {
    // markdown-it 自身の validateLink が先に除外する（Layer 2）。
    // 結果はリンクではなく素のテキストになる。
    const out = pipeline('[click](javascript:alert(1))');
    expect(out).not.toContain('<a');
    expect(out).not.toContain('href');
  });

  it('生 HTML の javascript: href を落とす', () => {
    const out = pipeline('<a href="javascript:alert(1)">x</a>');
    expect(out).not.toContain('javascript:');
    expect(out).not.toContain('href');
  });

  it('生 HTML の vbscript: href を落とす', () => {
    const out = pipeline('<a href="vbscript:msgbox(1)">y</a>');
    expect(out).not.toContain('vbscript:');
    expect(out).not.toContain('href');
  });

  it('data:text/html を落とす（data: の最大の抜け道）', () => {
    const out = pipeline('<a href="data:text/html;base64,PHNjcmlwdD4=">x</a>');
    expect(out).not.toContain('data:text/html');
  });

  it.each([['weird://payload'], ['ftp://example.com/a'], ['cid:x'], ['sms:+81'], ['callto:x']])(
    '許可していないスキームを落とす: %s',
    (href) => {
      // ftp / cid / sms / callto は DOMPurify の既定では通る。
      // こちらの許可リストのほうが狭いことを固定しておく。
      const out = pipeline(`<a href="${href}">x</a>`);
      expect(out).not.toContain(href);
    },
  );

  it('DOMPurify が通すスキームでも、こちらの許可リスト外なら痕跡を残す', () => {
    const out = pipeline('<a href="ftp://example.com/a">x</a>');
    expect(out).toContain('data-mx-blocked');
  });

  it('SVG 内のスクリプトを落とす', () => {
    const out = pipeline('<svg><script>alert(1)</script></svg>');
    expect(out).not.toContain('alert');
  });

  it('base タグを落とす（相対 URL の乗っ取り防止）', () => {
    expect(pipeline('<base href="https://evil.example/">')).not.toContain('<base');
  });
});

describe('正当な内容は壊さない', () => {
  it('見出し・段落・強調を残す', () => {
    const out = pipeline('# 見出し\n\n**強調**と*斜体*\n');
    expect(out).toContain('<h1');
    expect(out).toContain('<strong>');
    expect(out).toContain('<em>');
  });

  it('data-line を残す（スクロール同期の基盤）', () => {
    expect(pipeline('# a\n')).toContain('data-line="0"');
  });

  it('https の画像を残す', () => {
    expect(pipeline('![alt](https://example.com/a.png)')).toContain('https://example.com/a.png');
  });

  it.each([
    ['./ 付き', './img/a.png'],
    ['接頭辞なし', 'img/a.png'],
    ['同階層', 'a.png'],
    ['親階層', '../assets/a.png'],
    ['エンコード済み', 'img/%E3%81%82.png'],
  ])('相対パスの画像を残す: %s', (_name, href) => {
    // resolve_asset が後でスコープ検証する（N-SEC-05）。
    // ここで除去すると、最も普通の書き方の画像が全部消える。
    const out = pipeline(`![alt](${href})`);
    expect(out).toContain(href);
    expect(out).not.toContain('data-mx-blocked');
  });

  it('Windows の絶対パスを残す', () => {
    expect(pipeline('<img src="C:/work/a.png">')).not.toContain('data-mx-blocked');
  });

  it('picture/source の srcset を残す（ダークモード用画像の出し分け）', () => {
    const out = pipeline(
      '<picture><source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.svg" /><img src="assets/logo-light.svg" alt="x" /></picture>',
    );
    expect(out).toContain('srcset="assets/logo-dark.svg"');
    expect(out).not.toContain('data-mx-blocked');
  });

  it('srcset の複数候補（記述子付き）を残す', () => {
    const out = pipeline('<img src="a.png" srcset="a.png 1x, b.png 2x">');
    expect(out).toContain('srcset="a.png 1x, b.png 2x"');
  });

  it('data:image を残す', () => {
    const uri = 'data:image/png;base64,iVBORw0KGgo=';
    expect(pipeline(`![alt](${uri})`)).toContain('data:image/png');
  });

  it('コードブロックの中身をエスケープして残す', () => {
    const out = pipeline('```html\n<script>alert(1)</script>\n```\n');
    expect(out).toContain('&lt;script&gt;');
    expect(out).not.toContain('<script>');
  });

  it('アンカーリンクを残す', () => {
    expect(pipeline('[jump](#section)')).toContain('href="#section"');
  });
});

describe('リンクの後処理', () => {
  it('外部リンクに rel を付ける', () => {
    expect(pipeline('[x](https://example.com/)')).toContain('rel="noopener noreferrer"');
  });

  it('target を落とす（ナビゲーションは JS が捕捉する）', () => {
    expect(pipeline('<a href="https://example.com/" target="_blank">x</a>')).not.toContain('target=');
  });

  it('落とした参照に痕跡を残す', () => {
    // 痕跡を残さずに消すと「なぜ表示されないのか」が分からなくなる
    expect(pipeline('<img src="ftp://example.com/a.png">')).toContain('data-mx-blocked');
  });

  it('srcset は候補単位で許可リストを検証する', () => {
    const out = pipeline('<img src="a.png" srcset="a.png 1x, javascript:alert(1) 2x">');
    expect(out).toContain('srcset="a.png 1x"');
    expect(out).not.toContain('javascript:');
  });

  it('srcset の候補が全滅したら属性ごと落として痕跡を残す', () => {
    // ftp: は DOMPurify 自身は除去しない（こちらの許可リストのほうが狭い）ため、フックまで値が届くことを確認できる
    const out = pipeline('<img src="a.png" srcset="ftp://example.com/a.png 1x, ftp://example.com/b.png 2x">');
    expect(out).not.toContain('srcset=');
    expect(out).toContain('data-mx-blocked');
  });
});

describe('input は 1 つも通さない (F-VIEW-01)', () => {
  it('タスクリストのチェックボックスは span で出る', () => {
    // タスクリストは `<input>` を出さないため、`<input>` に例外を設ける理由が無い（`markdown/plugins/task-list.ts`）。
    const out = pipeline('- [ ] 未完了\n- [x] 完了\n');
    expect(out).not.toContain('<input');
    expect(out).toContain('role="checkbox"');
    expect(out).toContain('aria-checked="true"');
  });

  it('テキスト入力欄は落とす', () => {
    expect(pipeline('<input type="text" name="password">')).not.toContain('<input');
  });

  it('生 HTML のチェックボックスは disabled の有無によらず落とす', () => {
    expect(pipeline('<input type="checkbox">')).not.toContain('<input');
    expect(pipeline('<input type="checkbox" disabled>')).not.toContain('<input');
  });

  it('type の無い input は落とす', () => {
    expect(pipeline('<input disabled>')).not.toContain('<input');
  });

  it('生 HTML の span は残るが、行が対応しなければ操作しても何も起きない', () => {
    // 除去する理由が無い span を除去すると、本文の普通の記述まで消える。
    // 押しても何も起きないことは `features/preview/task.ts` と `document/task.ts` が担保する。
    expect(pipeline('<span class="mx-task" role="checkbox"></span>')).toContain('mx-task');
  });

  it('button / textarea / select は引き続き落とす', () => {
    const out = pipeline('<button>x</button><textarea></textarea><select></select>');
    expect(out).not.toContain('<button');
    expect(out).not.toContain('<textarea');
    expect(out).not.toContain('<select');
  });
});

describe('本文中の style タグをプレビューへ閉じ込める (issue #161)', () => {
  it('本文の style をプレビューの外へ流出させない', () => {
    const out = pipeline('<style scoped>\nol { height: stretch; }\n</style>\n');
    expect(out).toContain('@scope (#mx-preview)');
    expect(out).toContain('ol { height: stretch; }');
  });

  it('文書の先頭に置いても消えない', () => {
    // <style> が本文の先頭だと、DOMParser のフルドキュメント解析で head 側へ回されて消える（FORCE_BODY で防ぐ）。
    const out = pipeline('<style>ol { color: red; }</style>\n\n見出し\n');
    expect(out).toContain('@scope (#mx-preview)');
    expect(out).toContain('ol { color: red; }');
  });

  it('波かっこを余分に閉じて範囲外へ出ようとしたものは丸ごと落とす', () => {
    const out = pipeline('<style>}\nbody { display: none !important; }\n/*</style>\n');
    expect(out).not.toContain('display: none');
    expect(out).not.toContain('<style');
  });

  it('@scope の中に別の @scope を紛れ込ませて範囲を広げようとしたものは丸ごと落とす', () => {
    const out = pipeline('<style>}\n@scope (*) { body { display: none; } }\n/*</style>\n');
    expect(out).not.toContain('display: none');
    expect(out).not.toContain('<style');
  });

  it('正当な入れ子（@media）は保持する', () => {
    const out = pipeline('<style>@media (prefers-color-scheme: dark) { ol { color: white; } }</style>\n');
    expect(out).toContain('@scope (#mx-preview)');
    expect(out).toContain('@media (prefers-color-scheme: dark)');
  });

  it('複数の style タグをそれぞれ独立して包む', () => {
    const out = pipeline('<style>ol { color: red; }</style>\n\n本文\n\n<style>ul { color: blue; }</style>\n');
    expect(out.match(/@scope \(#mx-preview\)/g)).toHaveLength(2);
  });
});

describe('GitHub 由来の拡張記法を壊さない', () => {
  it('GitHub Alerts を残す (F-VIEW-14)', () => {
    const out = pipeline('> [!NOTE]\n> 本文\n');
    expect(out).toContain('markdown-alert-note');
    expect(out).toContain('<svg');
  });

  it('Alerts のアイコン SVG が SVG プロファイルを通る', () => {
    // USE_PROFILES に svg が入っていないと、ここで path ごと消える。
    expect(pipeline('> [!WARNING]\n> 本文\n')).toContain('<path');
  });

  it('脚注のリンクと本文を残す (F-VIEW-16)', () => {
    const out = pipeline('本文[^1]。\n\n[^1]: 脚注。\n');
    expect(out).toContain('href="#fn1"');
    expect(out).toContain('class="footnotes"');
  });
});
