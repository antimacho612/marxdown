// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useDocumentStore } from '@/features/document/store';
import { getPlatform, setPlatform, type Platform } from '@/platform';

import { installLinkHandler } from './links';

const original = getPlatform();

const openPathSpy = vi.hoisted(() => vi.fn(() => Promise.resolve(null)));
vi.mock('@/features/document/open', () => ({ openPath: openPathSpy }));

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
  document.body.innerHTML = '<div id="mx-preview"></div>';
  container = document.querySelector('#mx-preview') as HTMLElement;
  dispose = installLinkHandler(container);

  useDocumentStore.setState({
    meta: {
      path: 'C:\\work\\docs\\index.md',
      eol: 'lf',
      bom: false,
      encoding: 'utf8',
      mtimeMs: 1,
      size: 1,
      readonly: false,
    },
    notice: null,
  });
});

afterEach(() => {
  dispose();
  setPlatform(original);
});

describe('リンククリックの分岐 (02.architecture.md §9.2)', () => {
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

    expect(openPathSpy).toHaveBeenCalledWith('C:\\work\\docs\\./other.md');
    expect(spies.openExternal).not.toHaveBeenCalled();
  });

  it('親をたどる相対パスも、畳まずに Rust へ渡す（正規化は Rust の仕事）', () => {
    click('<a href="../README.md">up</a>');

    expect(openPathSpy).toHaveBeenCalledWith('C:\\work\\docs\\../README.md');
  });

  it('アンカー付きの Markdown リンクも Markdown として扱う', () => {
    click('<a href="./other.md#section">other</a>');

    expect(openPathSpy).toHaveBeenCalledOnce();
  });

  it('Markdown 以外のローカルファイルは、確認してからでないと開かない (F-VIEW-06)', () => {
    click('<a href="./diagram.png">png</a>');

    expect(spies.openLocalFile).not.toHaveBeenCalled();

    const notice = useDocumentStore.getState().notice;
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
    expect(useDocumentStore.getState().notice).toBeNull();
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
    container.innerHTML =
      '<a href="#%E8%A6%8B%E5%87%BA%E3%81%97">go</a><h2 id="見出し">見出し</h2>';
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
