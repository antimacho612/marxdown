// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { documentStore } from '@/features/document';
import { getPlatform, setPlatform, type Platform } from '@/platform';

import { installLinkHandler } from './links';

const original = getPlatform();

/**
 * 開く先。モジュールのモックではなく、注入する関数をそのまま観測する（`installLinkHandler` は `document` を参照しないため）。
 * 引数の形は `bootstrap.ts` が `openPath` へ渡すものに合わせてある。
 */
const openPathSpy = vi.fn((_path: string, _options: { anchor?: string }) => Promise.resolve(null));

/** 別ウィンドウで開く先（F-OPEN-06 / `Shift+Click`）。こちらも注入する手をそのまま覗く。 */
const openInNewWindowSpy = vi.fn((_path: string) => {});

interface Spies {
  openExternal: ReturnType<typeof vi.fn>;
  openLocalFile: ReturnType<typeof vi.fn>;
  revealInFileManager: ReturnType<typeof vi.fn>;
}

let spies: Spies;
let container: HTMLElement;
let dispose: () => void;

function click(html: string, selector = 'a'): void {
  container.innerHTML = html;
  container.querySelector<HTMLElement>(selector)?.click();
}

beforeEach(() => {
  spies = {
    openExternal: vi.fn(() => Promise.resolve()),
    openLocalFile: vi.fn(() => Promise.resolve()),
    revealInFileManager: vi.fn(() => Promise.resolve()),
  };
  setPlatform({ ...original, ...spies } as Platform);

  openPathSpy.mockClear();
  openInNewWindowSpy.mockClear();
  document.body.innerHTML = '<div id="mx-preview"></div>';
  container = document.querySelector('#mx-preview') as HTMLElement;
  // 実アプリで `bootstrap.ts` が繋ぐ配線を、ここでも同じ形で組み立てる。
  dispose = installLinkHandler(container, {
    currentPath: () => documentStore.meta?.path ?? '',
    open: (path, anchor) => void openPathSpy(path, anchor === undefined ? {} : { anchor }),
    openInNewWindow: (path) => void openInNewWindowSpy(path),
    notify: (notice) => {
      documentStore.notice = notice;
    },
  });

  documentStore.meta = {
    path: 'C:\\work\\docs\\index.md',
    eol: 'lf',
    bom: false,
    encoding: 'utf8',
    mtimeMs: 1,
    size: 1,
    readonly: false,
  };
  documentStore.notice = null;
});

afterEach(() => {
  dispose();
  setPlatform(original);
});

describe('リンククリックの分岐 (02.architecture/09-security.md §2)', () => {
  it('外部リンクは既定ブラウザに渡す。アプリ内では開かない (F-VIEW-06 / N-SEC-04)', () => {
    click('<a href="https://example.com/x">x</a>');

    expect(spies.openExternal).toHaveBeenCalledWith('https://example.com/x');
    expect(openPathSpy).not.toHaveBeenCalled();
  });

  it('mailto: も既定のクライアントへ渡す', () => {
    click('<a href="mailto:a@example.com">mail</a>');

    expect(spies.openExternal).toHaveBeenCalledWith('mailto:a@example.com');
  });

  it('相対パスの Markdown はアプリ内で開く (F-VIEW-05)', () => {
    click('<a href="./other.md">other</a>');

    expect(openPathSpy).toHaveBeenCalledWith('C:\\work\\docs\\./other.md', {});
    expect(spies.openExternal).not.toHaveBeenCalled();
  });

  it('親をたどる相対パスも、畳まずに Rust へ渡す（正規化は Rust の仕事）', () => {
    click('<a href="../README.md">up</a>');

    expect(openPathSpy).toHaveBeenCalledWith('C:\\work\\docs\\../README.md', {});
  });

  /**
   * `#` 以降はパスの一部ではない。付けたまま Rust へ渡すと not-found になる。
   * 開いた後の着地点として分けて渡す（F-VIEW-05 / F-VIEW-07）。
   */
  it('アンカー付きの Markdown リンクは、パスと着地点に分けて渡す', () => {
    click('<a href="./other.md#section">other</a>');

    expect(openPathSpy).toHaveBeenCalledWith('C:\\work\\docs\\./other.md', { anchor: 'section' });
  });

  /** ブラウザの慣習に合わせた導線（F-OPEN-06）。既定の「同じタブで開く」は変えない。 */
  it('Shift+Click は別ウィンドウで開く (F-OPEN-06)', () => {
    container.innerHTML = '<a href="./other.md">other</a>';
    container.querySelector('a')?.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));

    expect(openInNewWindowSpy).toHaveBeenCalledWith('C:\\work\\docs\\./other.md');
    expect(openPathSpy).not.toHaveBeenCalled();
  });

  /**
   * 別ウィンドウへ渡せるのはパスだけである。
   * 起動時に開くファイルへ節を指定する経路が無く（`marxdown foo.md#section` は無い）、アンカーは落ちる。
   */
  it('Shift+Click ではアンカーを渡さない', () => {
    container.innerHTML = '<a href="./other.md#section">other</a>';
    container.querySelector('a')?.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));

    expect(openInNewWindowSpy).toHaveBeenCalledWith('C:\\work\\docs\\./other.md');
  });

  /** 外部リンクは `Shift` を押していても既定ブラウザである。窓を増やす対象は Markdown だけ（N-SEC-04）。 */
  it('Shift+Click でも外部リンクは既定ブラウザに渡す', () => {
    container.innerHTML = '<a href="https://example.com/x">x</a>';
    container.querySelector('a')?.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));

    expect(spies.openExternal).toHaveBeenCalledWith('https://example.com/x');
    expect(openInNewWindowSpy).not.toHaveBeenCalled();
  });

  it('Markdown 以外のローカルファイルは、確認してからでないと開かない (F-VIEW-06)', () => {
    click('<a href="./diagram.png">png</a>');

    expect(spies.openLocalFile).not.toHaveBeenCalled();

    const notice = documentStore.notice;
    expect(notice?.level).toBe('info');
    expect(notice?.actions?.map((a) => a.label)).toEqual(['開く', 'フォルダで表示']);

    notice?.actions?.[0]?.run();
    expect(spies.openLocalFile).toHaveBeenCalledWith('C:\\work\\docs\\./diagram.png');
  });

  it('未知のスキームは何もしない（許可リスト方式 / ADR-0006）', () => {
    for (const href of [
      'javascript:alert(1)',
      'vbscript:x',
      'data:text/html,<script>x</script>',
      'ms-msdt:/id',
      'steam://run/1',
    ]) {
      click(`<a href="${href}">x</a>`);
    }

    expect(spies.openExternal).not.toHaveBeenCalled();
    expect(spies.openLocalFile).not.toHaveBeenCalled();
    expect(openPathSpy).not.toHaveBeenCalled();
    expect(documentStore.notice).toBeNull();
  });

  it('どの分岐でも既定動作を止める（ページ遷移させない / N-SEC-04）', () => {
    container.innerHTML = '<a href="https://example.com/">x</a>';
    const anchor = container.querySelector('a') as HTMLAnchorElement;
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    anchor.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it('リンクの中の要素をクリックしても、そのリンクとして扱う', () => {
    click('<a href="https://example.com/"><code>x</code></a>', 'code');

    expect(spies.openExternal).toHaveBeenCalledWith('https://example.com/');
  });

  it('リンクでない場所のクリックは素通しする', () => {
    container.innerHTML = '<p>ただの本文</p>';
    const p = container.querySelector('p') as HTMLElement;
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    p.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });
});

describe('見出しアンカー (F-VIEW-07)', () => {
  it('本文の中の同じ id へスクロールする', () => {
    container.innerHTML = '<a href="#section">go</a><h2 id="section">見出し</h2>';
    const target = container.querySelector('h2') as HTMLElement;
    target.scrollIntoView = vi.fn();

    container.querySelector('a')?.click();

    expect(target.scrollIntoView).toHaveBeenCalled();
  });

  it('日本語の見出しにも飛べる（GitHub と同じくスラッグが日本語のまま残る）', () => {
    container.innerHTML = '<a href="#%E8%A6%8B%E5%87%BA%E3%81%97">go</a><h2 id="見出し">見出し</h2>';
    const target = container.querySelector('h2') as HTMLElement;
    target.scrollIntoView = vi.fn();

    container.querySelector('a')?.click();

    expect(target.scrollIntoView).toHaveBeenCalled();
  });

  it('本文の外にある同じ id へは飛ばない', () => {
    const outside = document.createElement('div');
    outside.id = 'section';
    outside.scrollIntoView = vi.fn();
    document.body.append(outside);

    click('<a href="#section">go</a>');

    expect(outside.scrollIntoView).not.toHaveBeenCalled();
  });
});
