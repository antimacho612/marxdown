// @vitest-environment jsdom
/**
 * スクロール同期の配線と双方向ジャンプ（F-MODE-05 / 03.ux-spec/03-split-mode.md §2, §3）。
 *
 * 補間の計算は `scroll-sync.test.ts` が検証している。
 * ここでは配線を検証し、「どちらが主導するか」「ダブルクリックがどの行になるか」「抜けたときに外れるか」を確認する。
 *
 * 受け取るのが `EditorScrollPort`（行番号だけを扱うインタフェース）であるため、Monaco をマウントせずに配線をすべて検証できる。
 * ポートの Monaco 側の実装は `features/editor/lazy/scroll-port.dom.test.ts` が実際のエディターで検証している。
 *
 * `getBoundingClientRect()` が jsdom では全部 0 を返すため、`data-line` のアンカーは位置を持てない。
 * そこは差し替える（`stubRects`）。
 * 位置を持たせないと `topForLine` が常に 0 を返し、どの行を渡しても同じ結果になってしまう。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  attachEditorScrollPort,
  isScrollSyncActive,
  jumpToEditorLine,
  jumpToPreviewLine,
  startScrollSync,
  stopScrollSync,
  takeEditorLead,
  type EditorScrollPort,
} from './scroll-sync';
import { viewStore } from './store.svelte';

const scrollToLine = vi.fn();
const revealLine = vi.fn();
let topLine = 1;
let notifyEditorScroll: (() => void) | null = null;
const offScroll = vi.fn();

const port: EditorScrollPort = {
  topLine: () => topLine,
  scrollToLine: (line) => scrollToLine(line),
  revealLine: (line, options) => revealLine(line, options),
  onScroll: (listener) => {
    notifyEditorScroll = listener;
    return offScroll;
  },
};

/**
 * `data-line` を持つ段落を 3 つ置き、jsdom が返さない位置を与える。
 * `data-line` 0/9/19（行 1/10/20）にそれぞれ top 0/200/400 を割り当てる。
 */
function stubRects(): HTMLElement {
  const preview = document.querySelector<HTMLElement>('#mx-preview');
  if (!preview) throw new Error('プレビューが無い');

  preview.innerHTML = ['0', '9', '19'].map((line) => `<p data-line="${line}">段落 ${line}</p>`).join('');

  // スクロールで動くことまで真似る。
  // 実際の矩形はビューポート基準で、`anchorsOf` はそこから `scrollTop` を引いて中身基準へ戻している。
  // 固定値を返すと、スクロールしたとたん対応がずれる。
  preview.getBoundingClientRect = () => ({ top: 0, bottom: 0, height: 0 }) as DOMRect;
  for (const [index, element] of [...preview.children].entries()) {
    element.getBoundingClientRect = () => {
      const top = index * 200 - preview.scrollTop;
      return { top, bottom: top, height: 0 } as DOMRect;
    };
  }

  return preview;
}

beforeEach(() => {
  scrollToLine.mockClear();
  revealLine.mockClear();
  offScroll.mockClear();
  notifyEditorScroll = null;
  topLine = 1;

  stopScrollSync();
  // エディターがマウントされている状態から始める。
  // インタフェースはスクロール同期とは別で、Split でなくても存在する（`attachEditorScrollPort`）。
  attachEditorScrollPort(port);
  document.body.innerHTML = '<div id="mx-preview"></div>';
  viewStore.scrollSync = true;
});

describe('開始と終了', () => {
  it('Split に入ると同期が始まり、抜けると外れる', () => {
    startScrollSync();
    expect(isScrollSyncActive()).toBe(true);

    stopScrollSync();
    expect(isScrollSyncActive()).toBe(false);
    expect(offScroll).toHaveBeenCalled();
  });

  it('2 回呼んでも二重に始まらない', () => {
    startScrollSync();
    const first = notifyEditorScroll;
    startScrollSync();
    expect(notifyEditorScroll).toBe(first);
  });

  it('抜けたあとはダブルクリックが効かない', () => {
    const preview = stubRects();
    startScrollSync();
    stopScrollSync();

    preview.querySelector('[data-line="9"]')?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(revealLine).not.toHaveBeenCalled();
  });
});

describe('主導権 (§2)', () => {
  it('エディターが動くとプレビューが追随する', () => {
    const preview = stubRects();
    startScrollSync();

    topLine = 10;
    notifyEditorScroll?.();
    expect(preview.scrollTop).toBe(200);
  });

  it('プレビューが動くとエディターが追随する', () => {
    const preview = stubRects();
    startScrollSync();

    preview.scrollTop = 400;
    preview.dispatchEvent(new Event('scroll'));
    expect(scrollToLine).toHaveBeenCalledWith(20);
  });

  it('動かされた側からは戻さない（循環的な同期を止める）', () => {
    const preview = stubRects();
    startScrollSync();

    // エディターが主導 → その結果として発火するプレビューの scroll は無視される。
    topLine = 10;
    notifyEditorScroll?.();
    preview.dispatchEvent(new Event('scroll'));

    expect(scrollToLine).not.toHaveBeenCalled();
  });

  it('主導権をエディターへ移すと、その直後のプレビューの scroll では追随しない', () => {
    const preview = stubRects();
    startScrollSync();

    // 再描画でプレビューを機械的に動かす側（`document/live.ts`）が呼ぶ。
    takeEditorLead();
    preview.scrollTop = 400;
    preview.dispatchEvent(new Event('scroll'));

    expect(scrollToLine).not.toHaveBeenCalled();
  });

  it('同期が OFF なら、どちらも追随しない', () => {
    const preview = stubRects();
    startScrollSync();
    viewStore.scrollSync = false;

    topLine = 10;
    notifyEditorScroll?.();
    preview.dispatchEvent(new Event('scroll'));

    expect(preview.scrollTop).toBe(0);
    expect(scrollToLine).not.toHaveBeenCalled();
  });
});

describe('双方向ジャンプ (§3)', () => {
  it('プレビューのダブルクリックで、その行へ飛ぶ', () => {
    const preview = stubRects();
    startScrollSync();

    // `data-line` は 0 始まり、エディターは 1 始まり。
    preview.querySelector('[data-line="9"]')?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(revealLine).toHaveBeenCalledWith(10, { focus: true });
  });

  it('インライン要素を叩いても、囲んでいるブロックの行になる', () => {
    const preview = stubRects();
    const paragraph = preview.querySelector('[data-line="19"]');
    paragraph?.append(Object.assign(document.createElement('code'), { textContent: 'x' }));
    startScrollSync();

    paragraph?.querySelector('code')?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(revealLine).toHaveBeenCalledWith(20, { focus: true });
  });

  it('`data-line` を持たない場所では何も起きない', () => {
    const preview = stubRects();
    startScrollSync();

    preview.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(revealLine).not.toHaveBeenCalled();
  });

  it('同期が OFF でもジャンプは効く（§2 の但し書き）', () => {
    const preview = stubRects();
    startScrollSync();
    viewStore.scrollSync = false;

    preview.querySelector('[data-line="9"]')?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(revealLine).toHaveBeenCalledWith(10, { focus: true });
  });

  it('アウトラインからはフォーカスを移さない', () => {
    stubRects();
    startScrollSync();

    jumpToEditorLine(10, { focus: false });
    expect(revealLine).toHaveBeenCalledWith(10, { focus: false });
  });

  it('エディター側からプレビューへも飛べる', () => {
    const preview = stubRects();
    startScrollSync();

    jumpToPreviewLine(20);
    expect(preview.scrollTop).toBe(400);
  });

  it('Split でなくてもエディターへは飛べる（Edit のアウトライン）', () => {
    stubRects();

    jumpToEditorLine(10, { focus: false });
    expect(revealLine).toHaveBeenCalledWith(10, { focus: false });
  });

  it('エディターが載っていなければ、どちらのジャンプも何もしない', () => {
    const preview = stubRects();
    attachEditorScrollPort(null);

    jumpToEditorLine(10);
    jumpToPreviewLine(20);

    expect(revealLine).not.toHaveBeenCalled();
    expect(preview.scrollTop).toBe(0);
  });

  it('プレビューへのジャンプは Split のあいだだけ効く', () => {
    const preview = stubRects();

    jumpToPreviewLine(20);
    expect(preview.scrollTop).toBe(0);
  });
});
