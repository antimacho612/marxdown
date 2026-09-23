// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { cancelPaint, paint } from './paint';

function container(): HTMLElement {
  const el = document.createElement('div');
  document.body.append(el);
  return el;
}

beforeEach(() => {
  document.body.replaceChildren();
  // jsdom には requestIdleCallback が無い。paint.ts の setTimeout フォールバックが働く。
  vi.stubGlobal('requestIdleCallback', undefined);
});

describe('段階的描画 (02.architecture/06-markdown-rendering-pipeline.md §4)', () => {
  it('最初のチャンクは同期的に入る', () => {
    const el = container();
    paint(el, ['<p>first</p>', '<p>second</p>']);
    // await していない時点で first だけが入っていること。
    // ここが非同期だと「読める最初のフレーム」が 1 フレーム遅れる。
    expect(el.textContent).toBe('first');
  });

  it('残りのチャンクは idle で入る', async () => {
    const el = container();
    const result = paint(el, ['<p>a</p>', '<p>b</p>', '<p>c</p>']);
    await result.done;
    expect(el.textContent).toBe('abc');
  });

  it('チャンクが 1 つなら done が即座に解決する', async () => {
    const el = container();
    const result = paint(el, ['<p>only</p>']);
    await expect(result.done).resolves.toBeTypeOf('number');
  });

  /**
   * ここが停止しないと、表示されない DOM を裏で作り続ける。
   *
   * 段階的描画の途中で次のファイルを開くと、古いループの投入先は `replaceChildren()` によって既に切り離されている。
   * それでも追記を続けると、未投入のチャンク文字列（`huge.md` では数 MB）と、作りかけのツリーの両方が保持されたままになる。
   */
  it('次の描画が始まったら、前の描画は続きを入れない', async () => {
    const el = container();
    const many = Array.from({ length: 50 }, (_, i) => `<p>old-${String(i)}</p>`);

    paint(el, many);
    // 最初のチャンクだけが入った状態で、次のファイルを開く。
    paint(el, ['<p>new</p>']);

    // 古いループが動作し続けていれば、ここで old-* が追加される。
    await new Promise((r) => setTimeout(r, 20));

    expect(el.textContent).toBe('new');
    expect(document.body.textContent).not.toContain('old-');
  });

  it('打ち切られた描画の done は解決しない', async () => {
    const el = container();
    const first = paint(el, ['<p>a</p>', '<p>b</p>', '<p>c</p>']);

    let settled = false;
    void first.done.then(() => (settled = true));

    paint(el, ['<p>next</p>']);
    await new Promise((r) => setTimeout(r, 20));

    // 解決させると、呼び出し側が切り離されたコンテナに対して `enhance` とアンカー復元をやり直してしまう（`open.ts`）。
    expect(settled).toBe(false);
  });

  /** タブを閉じるとき（N-PERF-06）のために、再描画を伴わない打ち切りも必要である。 */
  it('cancelPaint だけでも、続きが入らなくなる', async () => {
    const el = container();
    const many = Array.from({ length: 50 }, (_, i) => `<p>x-${String(i)}</p>`);

    paint(el, many);
    cancelPaint();
    await new Promise((r) => setTimeout(r, 20));

    expect(el.textContent).toBe('x-0');
  });

  it('最後まで入り切った描画は、次の描画を巻き添えにしない', async () => {
    const el = container();
    const first = paint(el, ['<p>a</p>', '<p>b</p>']);
    await first.done;

    const second = paint(el, ['<p>c</p>', '<p>d</p>']);
    await expect(second.done).resolves.toBeTypeOf('number');
    expect(el.textContent).toBe('cd');
  });

  it('描画のたびに前の内容を捨てる', async () => {
    const el = container();
    await paint(el, ['<p>old</p>']).done;
    await paint(el, ['<p>new</p>']).done;
    expect(el.textContent).toBe('new');
  });

  it('空のチャンク列でも落ちない', async () => {
    const el = container();
    await paint(el, []).done;
    expect(el.childNodes).toHaveLength(0);
  });
});

describe('Front Matter (F-VIEW-09)', () => {
  it('本文の前に置く', () => {
    const el = container();
    paint(el, ['<p>body</p>'], 'title: x');
    expect(el.firstElementChild?.className).toBe('mx-front-matter');
    expect(el.firstElementChild?.textContent).toBe('title: x');
  });

  it('null なら何も足さない', () => {
    const el = container();
    paint(el, ['<p>body</p>'], null);
    expect(el.querySelector('.mx-front-matter')).toBeNull();
  });

  it('中身は HTML として解釈しない', () => {
    const el = container();
    paint(el, ['<p>body</p>'], '<script>alert(1)</script>');
    expect(el.querySelector('script')).toBeNull();
    expect(el.querySelector('.mx-front-matter')?.textContent).toContain('<script>');
  });
});

describe('描画経路のサニタイズ', () => {
  it('paint を通した時点でスクリプトが消えている', () => {
    // sanitize を呼び忘れる事故を構造的に防ぐための回帰テスト
    const el = container();
    paint(el, ['<p>ok</p><script>alert(1)</script>']);
    expect(el.querySelector('script')).toBeNull();
    expect(el.textContent).toBe('ok');
  });
});
