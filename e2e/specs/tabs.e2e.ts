/**
 * タブ（F-NAV-01, 02 / M3 Phase 2）。
 *
 * **ここでしか確かめられないのは 2 つ。**
 *
 * 1 つは argv 転送がタブを増やすこと。単一インスタンスの 2 回目の起動（`forwardOpen`）は
 * 本物のプロセスを立てないと再現できず、Vitest 側はプラットフォームをモックしている。
 *
 * もう 1 つはキーの取り合いである。`Ctrl+W` はブラウザではウィンドウを閉じるキー、
 * `Ctrl+Tab` はフォーカス移動のキーで、どちらも既定動作を止めないと窓ごと消える。
 * アプリのグローバルキーとエディターのキーバインドが同じキーを取り合っていないことは、
 * 本物のキーイベントを流さないと確かめられない（`e2e/README.md`）。
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';

import { Key } from 'webdriverio';

import { editorText, enterEditMode, openViaForward, typeAtEnd } from '../helpers/app';
import { WORK_DIR, WORK_DOC, writeFile } from '../helpers/fixtures';

/**
 * もう 1 枚開くための別ファイル。作業ファイルと同じ場所に置く。
 *
 * `onPrepare` が作り直すのは `doc.md` の 1 枚だけなので（`helpers/fixtures.ts`）、こちらはこの spec が作る。
 */
const SECOND_DOC = WORK_DOC.replace('doc.md', 'second.md');

/**
 * 下の階層に置くファイル。クイックオープンが再帰していることを見るために使う。
 * ファイルツリーは 1 階層しか読まないので、これはツリーには出てこない。
 */
const NESTED_DOC = path.join(WORK_DIR, 'nested', 'buried.md');

/** タブの枚数。1 枚のときはタブバー自体が無いので 0 になる。 */
async function tabCount(): Promise<number> {
  return browser.execute(() => document.querySelectorAll('.mx-tab').length);
}

/** タブの名前。1 枚のときはタブバー自体が無いので空になる。 */
async function tabNames(): Promise<string[]> {
  return browser.execute(() =>
    [...document.querySelectorAll('.mx-tab__name')].map((element) => element.textContent ?? ''),
  );
}

/** いま選ばれているタブの名前。 */
async function activeTabName(): Promise<string> {
  return browser.execute(() => document.querySelector('.mx-tab--active .mx-tab__name')?.textContent ?? '');
}

/** 各タブの中心座標。ドラッグの始点と終点に使う。 */
async function tabCenters(): Promise<{ x: number; y: number }[]> {
  return browser.execute(() =>
    [...document.querySelectorAll('.mx-tab__label')].map((element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }),
  );
}

/** レフトペインが閉じていれば開く。開閉は永続化されるため、トグルでは状態が定まらない。 */
async function openLeftPane(): Promise<void> {
  const open = await browser.execute(() => document.querySelector('.mx-leftpane') !== null);
  if (!open) await browser.keys([Key.Control, Key.Shift, 'b']);
}

/** ファイルツリーに並んでいる名前。 */
async function treeNames(): Promise<string[]> {
  return browser.execute(() =>
    [...document.querySelectorAll('.mx-tree__name')].map((element) => element.textContent ?? ''),
  );
}

/** パレットに並んでいる名前（コマンド名 / ファイル名）。 */
async function paletteNames(): Promise<string[]> {
  return browser.execute(() =>
    [...document.querySelectorAll('.mx-palette__text')].map((element) => element.textContent ?? ''),
  );
}

/** ステータスバーの文言。倍率やモードが出る。 */
async function statusBarText(): Promise<string> {
  return browser.execute(() => document.querySelector('.mx-statusbar')?.textContent ?? '');
}

/** タイトルバーに出ているファイル名（タブが 1 枚のときの表示）。 */
async function titleName(): Promise<string> {
  return browser.execute(() => document.querySelector('.mx-titlebar__name')?.textContent ?? '');
}

describe('タブ', () => {
  before(async () => {
    writeFile(SECOND_DOC, { content: `# second\n\n2 枚目\n` });
    await openViaForward(WORK_DOC, '本文です。');
  });

  it('1 枚のときはタブバーを出さない', async () => {
    // 03.ux-spec/01-screen-layout.md §1。見た目が M2 から変わっていないことでもある。
    expect(await tabNames()).toEqual([]);
    expect(await titleName()).toBe('doc.md');
  });

  it('argv 転送は 2 枚目のタブとして開く', async () => {
    await openViaForward(SECOND_DOC, '2 枚目');

    await browser.waitUntil(async () => (await tabCount()) === 2, {
      timeout: 20_000,
      timeoutMsg: 'タブが 2 枚にならなかった',
    });
    expect(await tabNames()).toEqual(['doc.md', 'second.md']);
    expect(await activeTabName()).toBe('second.md');
  });

  it('同じファイルを転送しても増えず、そのタブへ戻る', async () => {
    await openViaForward(WORK_DOC, '本文です。');

    expect(await tabNames()).toEqual(['doc.md', 'second.md']);
    expect(await activeTabName()).toBe('doc.md');
  });

  it('Ctrl+Tab で次のタブへ移る', async () => {
    await browser.keys([Key.Control, Key.Tab]);

    await browser.waitUntil(async () => (await activeTabName()) === 'second.md', {
      timeout: 10_000,
      timeoutMsg: 'Ctrl+Tab で切り替わらなかった',
    });
  });

  it('Ctrl+1 で 1 番目のタブへ移る', async () => {
    await browser.keys([Key.Control, '1']);

    await browser.waitUntil(async () => (await activeTabName()) === 'doc.md', {
      timeout: 10_000,
      timeoutMsg: 'Ctrl+1 で切り替わらなかった',
    });
  });

  it('Ctrl+W で閉じると 1 枚に戻り、タブバーが消える', async () => {
    await browser.keys([Key.Control, 'w']);

    await browser.waitUntil(async () => (await tabCount()) === 0, {
      timeout: 10_000,
      timeoutMsg: 'Ctrl+W で閉じられなかった',
    });
    // 窓は生きている（ブラウザ既定の「ウィンドウを閉じる」を止められている）。
    expect(await titleName()).toBe('second.md');
  });

  it('Ctrl+Shift+T で閉じたタブが戻る', async () => {
    await browser.keys([Key.Control, Key.Shift, 't']);

    await browser.waitUntil(async () => (await tabCount()) === 2, {
      timeout: 20_000,
      timeoutMsg: '閉じたタブが戻らなかった',
    });
    expect(await activeTabName()).toBe('doc.md');
  });
});

/**
 * タブごとの Undo（M3 Phase 2b）。
 *
 * **エディターが 1 つのモデルを使い回していると、ここで前の文書の本文が編集面へ入る。**
 * そのまま保存すればファイル全体が別物になる（N-CMP-03）。
 * モデルはタブごとに分かれている必要があり、それを確かめられるのは本物の Monaco だけである。
 */
describe('タブごとの Undo', () => {
  it('別のタブで Undo しても、他のファイルの本文が入らない', async () => {
    // doc.md を編集する。
    await enterEditMode();
    await typeAtEnd('ZZZ');
    await browser.waitUntil(
      async () => {
        const typed = await editorText();
        return typed.includes('ZZZ');
      },
      {
        timeout: 10_000,
        timeoutMsg: '打った文字が入らなかった',
      },
    );

    // second.md のタブへ移り、そこで Undo する。並び順に依存しないよう位置を見てから押す。
    const names = await tabNames();
    await browser.keys([Key.Control, String(names.indexOf('second.md') + 1)]);
    await browser.waitUntil(async () => (await activeTabName()) === 'second.md', {
      timeout: 10_000,
      timeoutMsg: 'タブが切り替わらなかった',
    });
    await browser.keys([Key.Control, 'z']);
    await browser.pause(300);

    const text = await editorText();
    expect(text).toContain('2 枚目');
    // doc.md の本文も、そこへ打った文字も入ってこない。
    expect(text).not.toContain('本文です。');
    expect(text).not.toContain('ZZZ');
  });
});

/**
 * 並べ替え（F-NAV-02 / M3 Phase 2c）。
 *
 * **ポインタで掴んで動かす経路は、本物のイベントでしか通らない。**
 * HTML5 の drag イベントは使えず（`disable_drag_drop_handler()` を呼べないため）、
 * ここで確かめているのは「ポインタの捕捉と、並びの差し替えが実機で成立すること」である。
 */
describe('タブの並べ替え', () => {
  it('押せば、そのタブが表示される', async () => {
    // 並べ替えを入れたことで、押したときの経路がポインタイベントに変わっている。
    const names = await tabNames();
    const current = await activeTabName();
    const other = names.findIndex((name) => name !== current);
    await $$('.mx-tab__label')[other]?.click();

    await browser.waitUntil(async () => (await activeTabName()) === names[other], {
      timeout: 10_000,
      timeoutMsg: '押しても切り替わらなかった',
    });
  });

  it('掴んで隣へ動かすと並びが入れ替わる', async () => {
    const before = await tabNames();
    expect(before).toHaveLength(2);

    const [from, to] = await tabCenters();
    if (from === undefined || to === undefined) throw new Error('タブの位置が取れなかった');

    await browser
      .action('pointer')
      .move({ x: Math.round(from.x), y: Math.round(from.y) })
      .down()
      // しきい値（6px）を超えるまでは動かないので、まず少しだけ動かす。
      .move({ x: Math.round(from.x) + 20, y: Math.round(from.y) })
      .move({ x: Math.round(to.x) + 20, y: Math.round(to.y) })
      .up()
      .perform();

    await browser.waitUntil(
      async () => {
        const names = await tabNames();
        return names[0] === before[1];
      },
      { timeout: 10_000, timeoutMsg: '並びが入れ替わらなかった' },
    );
    expect(await tabNames()).toEqual([before[1], before[0]]);
  });
});

/**
 * コマンドパレット（`Ctrl+Shift+P` / F-NAV-06 / M3 Phase 4）。
 *
 * **ここでしか確かめられないのは 2 つ。** 遅延チャンク（`palette-*.js`）が本物のビルドで載ること、
 * `Ctrl+Shift+P` が WebView 既定の動作に取られていないことである。
 */
describe('コマンドパレット', () => {
  it('Ctrl+Shift+P で開き、コマンドが並ぶ', async () => {
    await browser.keys([Key.Control, Key.Shift, 'p']);

    await browser.waitUntil(
      async () => {
        const count = await browser.execute(() => document.querySelectorAll('.mx-palette__list button').length);
        return count > 0;
      },
      { timeout: 20_000, timeoutMsg: 'パレットが開かなかった' },
    );
  });

  it('打つと絞り込まれ、Enter で実行される', async () => {
    // 「拡大」を絞り込んで実行する。倍率はステータスバーに出るので、外から結果が見える。
    // 倍率は `state.json` に保存されるため、絶対値ではなく**変わったこと**を見る。
    const before = await statusBarText();

    await browser.keys('拡大');
    await browser.keys([Key.Enter]);

    await browser.waitUntil(
      async () => {
        const after = await statusBarText();
        return after !== before;
      },
      { timeout: 10_000, timeoutMsg: 'パレットから実行しても倍率が変わらなかった' },
    );

    // 次の実行に影響を残さない。
    await browser.keys([Key.Control, '0']);
  });

  it('Escape で閉じる', async () => {
    await browser.keys([Key.Control, Key.Shift, 'p']);
    await browser.keys([Key.Escape]);

    const open = await browser.execute(() => document.querySelector('.mx-palette') !== null);
    expect(open).toBe(false);
  });
});

/**
 * ファイルツリー（F-NAV-03 / M3 Phase 5b）。
 *
 * **ここでしか確かめられないのは Rust の `list_dir` を通す経路である。**
 * Vitest 側はプラットフォームをモックしており、スコープ検証（N-SEC-05）も除外も通っていない。
 */
describe('ファイルツリー', () => {
  it('レフトペインを開くと、開いているファイルの隣が並ぶ', async () => {
    // **開閉は `state.json` に永続化される**（03.ux-spec/06-panes.md §3）。
    // 前回の実行で開いたままのことがあるため、トグルではなく「閉じていたら開く」にする。
    await openLeftPane();

    await browser.waitUntil(
      async () => {
        const names = await treeNames();
        return names.includes('doc.md');
      },
      { timeout: 20_000, timeoutMsg: 'ファイルツリーが出なかった' },
    );

    // 作業ディレクトリのファイルが並ぶ（`onPrepare` が作る `doc.md` と、この spec が作った `second.md`）。
    const names = await treeNames();
    expect(names).toContain('second.md');
  });

  it('押すとタブとして開く', async () => {
    await browser.execute(() => {
      const item = [...document.querySelectorAll('.mx-tree__item')].find((element) =>
        (element.textContent ?? '').includes('second.md'),
      );
      if (item instanceof HTMLElement) item.click();
    });

    // 枚数ではなく**表示中のタブ**が変わるのを待つ。
    // 枚数は既に条件を満たしていることがあり、その場合は読み込みを待たずに次へ進んでしまう。
    await browser.waitUntil(
      async () => {
        const name = await activeTabName();
        return name === 'second.md';
      },
      { timeout: 20_000, timeoutMsg: 'ツリーから開けなかった' },
    );
  });

  it('Ctrl+Shift+E でツリーへフォーカスが移る', async () => {
    // 「出してフォーカスする」であって、トグルではない（03.ux-spec/06-panes.md §4）。
    await browser.keys([Key.Control, Key.Shift, 'e']);

    await browser.waitUntil(
      async () => browser.execute(() => document.activeElement?.classList.contains('mx-tree__item') === true),
      { timeout: 20_000, timeoutMsg: 'ツリーへフォーカスが移らなかった' },
    );
  });
});

/**
 * クイックオープン（`Ctrl+P` / F-NAV-05 / M3 Phase 6）。
 *
 * **ここでしか確かめられないのは Rust の `list_files` を通す経路である。**
 * 再帰・除外・スコープ検証（N-SEC-05）は Vitest 側のモックでは通らない。
 * `Ctrl+P` が WebView 既定の印刷に取られていないことも、本物のキーでしか見えない。
 */
describe('クイックオープン', () => {
  before(() => {
    mkdirSync(path.dirname(NESTED_DOC), { recursive: true });
    writeFile(NESTED_DOC, {
      content: `# buried

下の階層
`,
    });
  });

  it('Ctrl+P で開き、下の階層のファイルまで並ぶ', async () => {
    await browser.keys([Key.Control, 'p']);

    await browser.waitUntil(
      async () => {
        const names = await paletteNames();
        return names.includes('buried.md');
      },
      { timeout: 20_000, timeoutMsg: 'クイックオープンに下の階層のファイルが出なかった' },
    );
  });

  it('絞り込んで Enter で開く', async () => {
    await browser.keys('buried');
    await browser.keys([Key.Enter]);

    await browser.waitUntil(async () => (await activeTabName()) === 'buried.md', {
      timeout: 20_000,
      timeoutMsg: 'クイックオープンから開けなかった',
    });
  });

  it('Escape で閉じる', async () => {
    await browser.keys([Key.Control, 'p']);
    await browser.keys([Key.Escape]);

    const open = await browser.execute(() => document.querySelector('.mx-palette') !== null);
    expect(open).toBe(false);
  });
});
