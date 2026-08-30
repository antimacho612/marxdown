/**
 * VS Code 互換の編集と、キーの衝突（F-EDIT-04〜07 / 03.ux-spec/04-keybindings.md）。
 *
 * # 単体テストでは足りない理由
 *
 * `keymap.test.ts` が見ているのは**表の中身**（外したキーが実在し、外れていること）で、
 * 押したときに何が起きるかは見ていない。ここで見るのはその先である。
 *
 * ```text
 * 実際の打鍵 → CodeMirror の keymap → コマンド → 本文
 * 実際の打鍵 → globalThis のリスナ  → アプリのコマンド
 * ```
 *
 * **2 つの経路が同じキーを取り合っていないこと**が Phase 3 の主題であり、
 * それは本物のキーイベントを流さないと確かめられない。
 *
 * # 未保存の確認（`confirm_discard`）はここでは見られない
 *
 * ネイティブのモーダルなので WebDriver から押せない（`quit.e2e.ts` と同じ制約）。
 * 出したまま先へ進めないので、**この spec からはダーティのまま開く操作をしない**。
 * 組み立ては `src/features/document/discard.dom.test.ts` が見ている。
 */
import { Key } from 'webdriverio';

import { editorText, enterEditMode, openViaForward } from '../helpers/app';
import { WORK_DOC } from '../helpers/fixtures';

/** 検索・置換パネル（`@codemirror/search`）が出ているか。 */
async function searchPanelOpen(): Promise<boolean> {
  return browser.execute(() => document.querySelectorAll('.cm-panel.cm-search').length === 1);
}

/** いまフォーカスがある入力欄の `name`。パネルのどの欄に居るかを見る。 */
async function focusedFieldName(): Promise<string> {
  return browser.execute(() => document.activeElement?.getAttribute('name') ?? '');
}

/** エディタの本文を行の配列で。 */
async function editorLines(): Promise<string[]> {
  const text = await editorText();
  return text.split('\n');
}

/** ライトペイン（アウトライン）が出ているか。 */
async function rightPaneOpen(): Promise<boolean> {
  return browser.execute(() => document.querySelectorAll('.mx-rightpane').length === 1);
}

before(async () => {
  await openViaForward(WORK_DOC, '本文です。');
  await enterEditMode();
  // 行操作は「どの行に居るか」で結果が変わる。毎回ここから始める。
  await $('.cm-content').click();
  await browser.keys([Key.Control, Key.Home]);
});

describe('行操作 (F-EDIT-07)', () => {
  /**
   * **`@replit/codemirror-vscode-keymap` は行複製を mac にしか割り当てていない。**
   * `copyLineUp` / `copyLineDown` が `mac:` だけを持ち、`key` が無い
   * （`features/editor/keymap.ts` の `ADDED` が補っている）。
   *
   * つまり**パッケージを入れただけでは Windows で効かない。** ここが落ちたら、
   * 補いが外れたということ。
   */
  it('Shift+Alt+↓ で行を複製する', async () => {
    await browser.keys([Key.Shift, Key.Alt, Key.ArrowDown]);

    const lines = await editorLines();
    expect(lines[0]).toBe('# E2E');
    expect(lines[1]).toBe('# E2E');
  });

  /**
   * **複製の直後に取り消す。** 2 つ操作してから 1 回取り消すのでは検証にならない。
   *
   * `history()` は**直前の変更から 500ms 以内の変更を 1 つのグループにまとめる**
   * （`newGroupDelay` の既定値）。E2E の打鍵はその間隔を必ず下回るので、
   * 複製 → 削除 → `Ctrl+Z` は**両方まとめて**取り消され、
   * 結果が「何も操作していない状態」と一致してしまう。
   */
  it('Ctrl+Z で元に戻る (F-EDIT-04)', async () => {
    await browser.keys([Key.Control, 'z']);

    const lines = await editorLines();
    expect(lines[0]).toBe('# E2E');
    expect(lines[1]).toBe('');
  });

  it('Ctrl+Shift+K で行を削除する', async () => {
    await browser.keys([Key.Control, Key.Shift, 'k']);

    const lines = await editorLines();
    expect(lines[0]).toBe('');
    expect(lines[1]).toBe('本文です。');
  });
});

describe('検索と置換 (F-EDIT-05)', () => {
  it('Ctrl+F でエディタの検索パネルが開く', async () => {
    // Preview を見ているときは本文検索が開く。**同じキーで別のものが開く**
    // （`features/view/find.ts`）。ここは Edit なのでエディタ側。
    await browser.keys([Key.Control, 'f']);

    await browser.waitUntil(() => searchPanelOpen(), {
      timeout: 10_000,
      timeoutMsg: 'エディタの検索パネルが開かなかった',
    });
    expect(await focusedFieldName()).toBe('search');
  });

  it('Ctrl+H で置換欄にフォーカスが移る', async () => {
    await browser.keys([Key.Control, 'h']);

    await browser.waitUntil(async () => (await focusedFieldName()) === 'replace', {
      timeout: 10_000,
      timeoutMsg: '置換欄にフォーカスが移らなかった',
    });
  });

  /**
   * **入力欄に居るまま閉じられること**が要点。`vscodeKeymap` の `Escape` は
   * scope を持たず編集面でしか効かないので、`keymap.ts` が scope 付きで足している。
   */
  it('置換欄に居るまま Escape で閉じられる', async () => {
    await browser.keys([Key.Escape]);

    await browser.waitUntil(async () => !(await searchPanelOpen()), {
      timeout: 10_000,
      timeoutMsg: 'Escape でパネルが閉じなかった',
    });
  });
});

describe('アプリのキーとエディタのキーが取り合わない', () => {
  /**
   * Phase 1・2 では、`whenEditing` を立てたキーだけが Edit モードで効いた。
   * ペイン・アウトライン・戻る/進むは**押しても何も起きない**状態だった。
   *
   * 境界を「入力中かどうか」から「どちらの表に書いてあるか」に変えた結果
   * （`app/commands.ts` / `features/editor/keymap.ts`）、ここが効くようになった。
   */
  it('Edit モードでもアプリのキーが効く（Ctrl+Alt+B でペイン開閉）', async () => {
    const before = await rightPaneOpen();

    await browser.keys([Key.Control, Key.Alt, 'b']);
    await browser.waitUntil(async () => (await rightPaneOpen()) !== before, {
      timeout: 10_000,
      timeoutMsg: 'Edit モードでペインのキーが効かなかった',
    });

    // 元に戻す。次のテストが見る面を変えない。
    await browser.keys([Key.Control, Key.Alt, 'b']);
    await browser.waitUntil(async () => (await rightPaneOpen()) === before, { timeout: 10_000 });
  });

  /**
   * プレビュー内検索のパネルは `document.body` にある。閉じずに Edit へ移ると
   * **隠れた面の上に浮いたまま残り**、`F3` / `Escape` がエディタ側と食い合う。
   */
  it('Preview で開いた検索は、Edit へ切り替えると閉じる', async () => {
    await browser.keys([Key.Control, Key.Shift, 'v']);
    await browser.waitUntil(() => browser.execute(() => document.documentElement.dataset['mxMode'] === 'preview'), {
      timeout: 10_000,
      timeoutMsg: 'Preview へ戻らなかった',
    });

    await browser.keys([Key.Control, 'f']);
    await browser.waitUntil(() => browser.execute(() => document.querySelectorAll('.mx-search').length === 1), {
      timeout: 10_000,
      timeoutMsg: 'プレビュー内検索が開かなかった',
    });

    await browser.keys([Key.Control, Key.Shift, 'v']);
    await browser.waitUntil(() => browser.execute(() => document.querySelectorAll('.mx-search').length === 0), {
      timeout: 10_000,
      timeoutMsg: 'Edit へ切り替えてもプレビュー内検索が残っている',
    });
  });
});
