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

/** 本文が `before` から変わるまで待つ。**変わった中身は expect が読める形で出す。** */
async function waitForChange(before: string): Promise<void> {
  await browser.waitUntil(async () => (await editorText()) !== before, {
    timeout: 10_000,
    timeoutMsg: `本文が変わらなかった（${before}）`,
  });
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

/**
 * Markdown の書式（F-EDIT-08〜10 / 03.ux-spec/04-keybindings.md §3「Markdown 書式」）。
 *
 * **ここで見るのは「キーが届くか」だけ。** どんな文字列になるかの境目は
 * `src/features/editor/format.test.ts` と `list.test.ts` が全部見ている。
 * E2E で 1 パターンずつ確かめるのは遅いうえ、届くことの証明にしかならない。
 *
 * 逆に**届くことは E2E でしか確かめられない**。`Ctrl+Alt+n` は Windows で
 * AltGr として扱われうるし、`` Ctrl+Shift+` `` は US 配列では `~` として届く。
 */
describe('Markdown 書式 (F-EDIT-08)', () => {
  before(async () => {
    // **先に編集面へフォーカスを戻す。** 直前の describe は検索パネルを
    // 触っており、フォーカスがエディタから外れたままになっている。
    await $('.cm-content').click();
    await browser.keys([Key.Control, 'a']);
    await browser.keys('書式の確認');
  });

  it('Ctrl+B で選択範囲を太字にする', async () => {
    await browser.keys([Key.Control, 'a']);
    await browser.keys([Key.Control, 'b']);

    await browser.waitUntil(async () => (await editorText()) === '**書式の確認**', {
      timeout: 10_000,
      timeoutMsg: 'Ctrl+B が届かなかった',
    });
  });

  it('もう一度押すと外れる (§5)', async () => {
    await browser.keys([Key.Control, 'a']);
    await browser.keys([Key.Control, 'b']);

    await browser.waitUntil(async () => (await editorText()) === '書式の確認', {
      timeout: 10_000,
      timeoutMsg: '太字が外れなかった',
    });
  });

  /** `Ctrl+1`〜`9` はタブ切り替えに要るので、見出しは `Ctrl+Alt+n`（§3 の但し書き）。 */
  it('Ctrl+Alt+2 で見出しになる', async () => {
    await browser.keys([Key.Control, Key.Alt, '2']);

    await browser.waitUntil(async () => (await editorText()) === '## 書式の確認', {
      timeout: 10_000,
      timeoutMsg: 'Ctrl+Alt+2 が届かなかった',
    });
  });

  it('Ctrl+Alt+0 で見出しを解除する', async () => {
    await browser.keys([Key.Control, Key.Alt, '0']);

    await browser.waitUntil(async () => (await editorText()) === '書式の確認', {
      timeout: 10_000,
      timeoutMsg: 'Ctrl+Alt+0 が届かなかった',
    });
  });
});

/**
 * リストの継続入力と採番（F-EDIT-09, 10）。
 *
 * **実装は `@codemirror/lang-markdown` が持っている**（`features/editor/list.ts`）。
 * 自前のコードが無いぶん、**効いていることを確かめる場所がここしか無い。**
 * 依存を上げたときに黙って外れるのを、ここで捕まえる。
 */
describe('リストの継続入力 (F-EDIT-09, 10)', () => {
  before(async () => {
    await $('.cm-content').click();
    await browser.keys([Key.Control, 'a']);
    await browser.keys('1. a');
  });

  it('Enter で次の項目ができ、番号が 1 つ進む', async () => {
    await browser.keys([Key.Enter]);
    await browser.keys('b');

    await browser.waitUntil(async () => (await editorText()) === '1. a\n2. b', {
      timeout: 10_000,
      timeoutMsg: 'リストが続かなかった',
    });
  });

  /** 途中に挿入すると、続きの番号も振り直される（`renumberList`）。 */
  it('途中に挿んだら、続きの番号も振り直される', async () => {
    await browser.keys([Key.Control, Key.Home]);
    await browser.keys([Key.End]);
    await browser.keys([Key.Enter]);

    await browser.waitUntil(async () => (await editorText()) === '1. a\n2. \n3. b', {
      timeout: 10_000,
      timeoutMsg: '番号が振り直されなかった',
    });
  });

  /**
   * 空の項目で押したら、続けずに畳む。
   *
   * **最後の行が記法で始まっていないこと**だけを見る。ちょうどの文字列で
   * 突き合わせると、リストの途中か末尾か・tight か loose かで結果が変わる
   * 実装の細部まで書き写すことになり、**依存を上げるたびに落ちる**。
   * F-EDIT-09 が求めているのは「リストを抜けられること」であって、
   * 空行がどこに入るかではない。
   */
  it('空の項目で Enter を押すとリストを抜ける', async () => {
    await browser.keys([Key.Control, Key.End]);
    await browser.keys([Key.Enter]);
    const before = await editorText();
    await browser.keys([Key.Enter]);
    await waitForChange(before);

    const lines = await editorLines();
    expect(lines.at(-1)).not.toMatch(/^\s*\d+[.)] /);
  });

  /** `1. ` の下は 3 文字下げないと入れ子にならない（`list.ts`）。 */
  it('Tab は記法の幅ぶん下げる', async () => {
    await browser.keys([Key.Control, 'a']);
    await browser.keys('1. a');
    await browser.keys([Key.Enter]);
    await browser.keys('b');
    const before = await editorText();

    await browser.keys([Key.Tab]);
    await waitForChange(before);

    expect(await editorText()).toBe('1. a\n   2. b');
  });
});
