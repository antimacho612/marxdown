/**
 * Split とスクロール同期（F-MODE-03, 05 / 03.ux-spec/03-split-mode.md）。
 *
 * 単体テストが 3 段で下を見ている（`scroll-sync.test.ts`: 補間の算数、`scroll-sync.dom.test.ts`: 配線＝主導権・ダブルクリック・開始と終了、`scroll-port.dom.test.ts`: 換算＝スクロール量 ⇄ 行番号）。
 * ここで見るのはその上に残る「実際に追随するか」で、本物のレイアウト（要素の高さが無いと data-line の位置が全部 0 になる）、本物の scroll イベント（ブラウザペインでは配送されないことがある、実測）、本物のキー配送（Ctrl+\ は配列によって届き方が変わる）の 3 つが同時に要る。
 *
 * 循環的な同期は「動いたこと」だけでは捕まらない。
 * 片方を動かすと相手が動き、それがまた片方を動かす。
 * 同期が効いていることと輪になっていないことは別の話なので、動かした側が動かされ返していないかを併せて見る。
 */
import { Key } from 'webdriverio';

import {
  activeLineText,
  editorScrollTop,
  enterEditMode,
  focusEditorSurface,
  isSearchPanelOpen,
  openViaForward,
  scrollEditorToEnd,
  scrollEditorToTop,
} from '../helpers/app';
import { WORK_DOC } from '../helpers/fixtures';

/** いまの表示モード。 */
async function currentMode(): Promise<string> {
  return browser.execute(() => document.documentElement.dataset['mxMode'] ?? '');
}

/** プレビューのスクロール位置。エディター側は `editorScrollTop`（helper）が持つ。 */
async function previewScrollTop(): Promise<number> {
  return browser.execute(() => document.querySelector('#mx-preview')?.scrollTop ?? -1);
}

/** エディター / プレビューのスクロール位置。 */
async function positions(): Promise<{ editor: number; preview: number }> {
  return { editor: await editorScrollTop(), preview: await previewScrollTop() };
}

/**
 * プレビューを動かす。**素の器なので代入で足りる**（`scroll` が飛ぶ）。
 *
 * エディター側は代入では動かない。Monaco の器は `overflow: hidden` で、
 * `scrollTop` を見ていないため（`helpers/app.ts` の `editorScrollTop`）。
 * あちらは `scrollEditorToEnd` / `scrollEditorToTop` がキーで動かす。
 */
async function scrollPreviewTo(top: number): Promise<void> {
  await browser.execute((to: number) => {
    const element = document.querySelector('#mx-preview');
    if (element) element.scrollTop = to;
  }, top);
}

/** 両方を先頭へ戻し、主導権が空くまで待つ。**どの検証もここから始める。** */
async function resetBoth(): Promise<void> {
  await scrollEditorToTop();
  await scrollPreviewTo(0);
  await releaseLead();
}

/**
 * 主導権が空くまで待つ（`SUPPRESS_MS` / §2）。
 *
 * 反対側を動かす前に必ず挟む。
 * 直前に片方が主導していると、そのあいだ反対側からの同期は無視される（循環的な同期を防ぐ仕掛けそのもの）。
 */
async function releaseLead(): Promise<void> {
  await browser.pause(400);
}

/** 反対側が動くまで待つ。 */
async function waitForFollow(side: 'editor' | 'preview', from: number): Promise<void> {
  await browser.waitUntil(
    async () => {
      const at = await positions();
      return Math.abs(at[side] - from) > 8;
    },
    { timeout: 10_000, timeoutMsg: `${side} が追随しなかった` },
  );
}

/**
 * 本文を、行と高さの対応が崩れる形にしておく。
 *
 * **1 行の見出しと長いコードブロックが並んでいないと、補間が効いているか
 * 分からない。** 素直な段落だけの本文では、行を数えるだけの実装でも通ってしまう。
 */
const DOC = ['# 見出し', '', '```', ...Array.from({ length: 60 }, (_, i) => `行 ${i + 1}`), '```', '', '終わり'].join(
  '\n',
);

before(async () => {
  await openViaForward(WORK_DOC, '本文です。');
  await enterEditMode();
  await focusEditorSurface();
  await browser.keys([Key.Control, 'a']);
  await browser.keys(DOC);
});

describe('Split に入る (F-MODE-03)', () => {
  it('Ctrl+\\ で Split になり、両方の面が出る', async () => {
    await browser.keys([Key.Control, '\\']);

    await browser.waitUntil(async () => (await currentMode()) === 'split', {
      timeout: 10_000,
      timeoutMsg: 'Split へ入らなかった',
    });

    const visible = await browser.execute(() => ({
      editor: (document.querySelector('#mx-editor')?.getBoundingClientRect().width ?? 0) > 0,
      preview: (document.querySelector('#mx-preview')?.getBoundingClientRect().width ?? 0) > 0,
      divider: document.querySelectorAll('.mx-split-divider').length,
    }));

    expect(visible).toEqual({ editor: true, preview: true, divider: 1 });
  });

  /**
   * **`calc(var(--x) * 1fr)` は通らない**（`styles/shell.css`）。
   * 宣言ごと捨てられて列が `auto` に潰れるが、**見た目はそれらしく出る**ので
   * 気づきにくい。比が本当に効いているかをここで固定する。
   */
  it('分割比が列幅に効いている', async () => {
    const ratio = await browser.execute(() => {
      const editor = document.querySelector('#mx-editor')?.getBoundingClientRect().width ?? 0;
      const preview = document.querySelector('#mx-preview')?.getBoundingClientRect().width ?? 0;
      return editor / (editor + preview);
    });

    expect(ratio).toBeGreaterThan(0.4);
    expect(ratio).toBeLessThan(0.6);
  });
});

describe('スクロール同期 (F-MODE-05 / §2)', () => {
  it('エディターを動かすとプレビューが追随する', async () => {
    await resetBoth();

    await scrollEditorToEnd();
    await waitForFollow('preview', 0);
  });

  it('プレビューを動かすとエディターが追随する', async () => {
    await resetBoth();

    await scrollPreviewTo(500);
    await waitForFollow('editor', 0);
  });

  /**
   * 循環的な同期が起きていないこと。
   * 動かした側が動かされ返すと、押した位置から離れていく（§2 の「主導権は最後に操作した側」）。
   *
   * 位置を数値で指定できないため（キーで動かす）、追随したあとに動かした側が動いていないことで見る。
   */
  it('動かした側が動かされ返さない', async () => {
    await resetBoth();
    await scrollEditorToEnd();
    await waitForFollow('preview', 0);

    const settled = await positions();
    await browser.pause(500);
    const later = await positions();

    expect(Math.abs(later.editor - settled.editor)).toBeLessThan(20);
  });

  /** OFF にしたら追随しない（§2 / ステータスバーの `⇄`）。 */
  it('同期を切ると追随しない', async () => {
    await browser.execute(() => {
      const button = [...document.querySelectorAll('.mx-statusbar__button')].find((el) =>
        (el.textContent ?? '').includes('スクロール同期'),
      );
      if (button instanceof HTMLElement) button.click();
    });

    await resetBoth();
    await scrollEditorToEnd();
    await browser.pause(500);

    const at = await positions();
    expect(at.preview).toBe(0);

    // 次のテストのために戻す。
    await browser.execute(() => {
      const button = [...document.querySelectorAll('.mx-statusbar__button')].find((el) =>
        (el.textContent ?? '').includes('スクロール同期'),
      );
      if (button instanceof HTMLElement) button.click();
    });
  });
});

describe('双方向ジャンプ (§3)', () => {
  /**
   * プレビューの要素をダブルクリック → エディターの該当行へ。
   *
   * 最後の段落（`終わり`）を叩くと、コードブロックより後ろの行へ飛ぶ。
   * **行を数えるだけの実装では、ここでコードブロックの中を指してしまう。**
   */
  it('プレビューをダブルクリックすると、エディターのその行へカーソルが移る', async () => {
    await resetBoth();

    await browser.execute(() => {
      const last = [...document.querySelectorAll('#mx-preview [data-line]')].at(-1);
      last?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    });

    await browser.waitUntil(
      async () => {
        const line = await activeLineText();
        return line.includes('終わり');
      },
      { timeout: 10_000, timeoutMsg: 'エディターの該当行へ移らなかった' },
    );
  });
});

/**
 * Split の検索（[03.ux-spec > keybindings §4](../../docs/03.ux-spec/04-keybindings.md)）。
 *
 * **同じ `Ctrl+F` が、フォーカスのある側を探す。** Split でしか起きない分岐であり、
 * 振り分けそのものは `src/features/view/find.dom.test.ts` が見ている。
 * **ここで見るのは「キーが届いて、本当に開くもの / 閉じるものが入れ替わるか」だけ。**
 */
describe('Split の検索 (F-VIEW-10 / F-EDIT-05)', () => {
  /** プレビュー内検索のパネルが出ているか。**エディターの外**にある。 */
  async function isPreviewFindOpen(): Promise<boolean> {
    return browser.execute(() => document.querySelectorAll('.mx-search').length === 1);
  }

  it('エディターにフォーカスがあるとエディター検索が開く', async () => {
    await focusEditorSurface();
    await browser.keys([Key.Control, 'f']);

    await browser.waitUntil(() => isSearchPanelOpen(), {
      timeout: 10_000,
      timeoutMsg: 'エディターの検索が開かなかった',
    });
    expect(await isPreviewFindOpen()).toBe(false);
  });

  it('プレビューを触ってから押すと本文検索に入れ替わる', async () => {
    await $('#mx-preview').click();
    await browser.keys([Key.Control, 'f']);

    await browser.waitUntil(() => isPreviewFindOpen(), {
      timeout: 10_000,
      timeoutMsg: 'プレビュー内検索が開かなかった',
    });

    // **同時に開かない。** 開いたほうが、もう片方を閉じる。
    await browser.waitUntil(async () => !(await isSearchPanelOpen()), {
      timeout: 10_000,
      timeoutMsg: 'エディターの検索が閉じなかった',
    });
  });

  it('Escape で閉じてから次へ進む', async () => {
    await browser.keys([Key.Escape]);
    await browser.waitUntil(async () => !(await isPreviewFindOpen()), {
      timeout: 10_000,
      timeoutMsg: 'プレビュー内検索が閉じなかった',
    });
  });
});

describe('モードの順送り (F-MODE-06)', () => {
  it('Ctrl+Shift+M で Preview → Edit → Split と回る', async () => {
    // いまは Split。1 周して戻ってくる。
    for (const expected of ['preview', 'edit', 'split']) {
      await browser.keys([Key.Control, Key.Shift, 'm']);
      await browser.waitUntil(async () => (await currentMode()) === expected, {
        timeout: 10_000,
        timeoutMsg: `${expected} へ回らなかった`,
      });
    }
  });
});
