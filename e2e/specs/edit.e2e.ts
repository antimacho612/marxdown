/**
 * VS Code 互換の編集と、キーの衝突（F-EDIT-04〜07 / 03.ux-spec/04-keybindings.md）。
 *
 * `keymap.test.ts` が見ているのは表の中身（外したキーが実在し、外れていること）で、押したときに何が起きるかは見ていない。
 * ここで見るのはその先、実際の打鍵が Monaco のキーバインド経由でコマンド・本文に届く経路と、`globalThis` のリスナ経由でアプリのコマンドに届く経路である。
 * 2 つの経路が同じキーを取り合っていないことが Phase 3 の主題であり、それは本物のキーイベントを流さないと確かめられない。
 *
 * 未保存の確認（`confirm_discard`）はここでは見られない。
 * ネイティブのモーダルなので WebDriver から押せない（`quit.e2e.ts` と同じ制約）。
 * 出したまま先へ進めないので、この spec からはダーティのまま開く操作をしない。
 * 組み立ては `src/features/document/discard.dom.test.ts` が見ている。
 */
import { Key } from 'webdriverio';

import {
  editorText,
  enterEditMode,
  focusedFindField,
  focusEditorSurface,
  isSearchPanelOpen,
  openViaForward,
} from '../helpers/app';
import { WORK_DOC } from '../helpers/fixtures';

/** エディターの本文を行の配列で。 */
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
  await focusEditorSurface();
  await browser.keys([Key.Control, Key.Home]);
});

describe('行操作 (F-EDIT-07)', () => {
  /**
   * **Monaco では既定で入っている。** CodeMirror のときは
   * `@replit/codemirror-vscode-keymap` が `copyLineUp` / `copyLineDown` を
   * `mac:` にしか割り当てておらず、Windows 用に自分で補っていた
   * （[ADR-0009](../../docs/adr/0009-editor-engine-monaco.md) でその補いは畳んだ）。
   *
   * ここが落ちたら、**剥がすキーを増やしたときに巻き添えにした**ということ。
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
   * どのエンジンも、近い時刻の変更を 1 つの取り消し単位にまとめる。
   * E2E の打鍵はその間隔を必ず下回るので、複製 → 削除 → `Ctrl+Z` と並べると
   * **両方まとめて**取り消され、結果が「何も操作していない状態」と一致してしまう。
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
  it('Ctrl+F でエディターの検索パネルが開く', async () => {
    // Preview を見ているときは本文検索が開く。**同じキーで別のものが開く**
    // （`features/view/find.ts`）。ここは Edit なのでエディター側。
    await browser.keys([Key.Control, 'f']);

    await browser.waitUntil(() => isSearchPanelOpen(), {
      timeout: 10_000,
      timeoutMsg: 'エディターの検索パネルが開かなかった',
    });
    expect(await focusedFindField()).toBe('search');
  });

  it('Ctrl+H で置換欄にフォーカスが移る', async () => {
    await browser.keys([Key.Control, 'h']);

    await browser.waitUntil(async () => (await focusedFindField()) === 'replace', {
      timeout: 10_000,
      timeoutMsg: '置換欄にフォーカスが移らなかった',
    });
  });

  /**
   * **入力欄に居るまま閉じられること**が要点。
   *
   * CodeMirror のときは `vscodeKeymap` の `Escape` が scope を持たず編集面でしか
   * 効かなかったので、`keymap.ts` が scope 付きで足していた。
   * **Monaco の `closeFindWidget` は「エディターにフォーカスがある」ことだけを見る**
   * （ウィジェットの入力欄もその内側）ので、足すものが無くなった。
   */
  it('置換欄に居るまま Escape で閉じられる', async () => {
    await browser.keys([Key.Escape]);

    await browser.waitUntil(async () => !(await isSearchPanelOpen()), {
      timeout: 10_000,
      timeoutMsg: 'Escape でパネルが閉じなかった',
    });
  });
});

describe('アプリのキーとエディターのキーが取り合わない', () => {
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
   * **隠れた面の上に浮いたまま残り**、`F3` / `Escape` がエディター側と食い合う。
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
    // 触っており、フォーカスがエディターから外れたままになっている。
    await focusEditorSurface();
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
 * **実装は自前**（`features/editor/enter.ts`）。組み立ての正しさは
 * `enter.test.ts` が見ているので、**ここで見るのは「キーが本当に届くか」だけ。**
 * `Enter` は Monaco の入力経路を横取りしているので、通しでしか確かめられない。
 */
describe('リストの継続入力 (F-EDIT-09, 10)', () => {
  before(async () => {
    await focusEditorSurface();
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

  /**
   * **続きの項目は振り直さない**（`src/features/editor/enter.ts` の決定）。
   *
   * 触れば「編集していない箇所のバイト列が変わる」ことになり、N-CMP-03 に反する。
   * Markdown は `1.` が並んでいても正しく採番して描くので、実害も無い。
   *
   * この 1 本は **CodeMirror の `renumberList` の挙動を書き写していた。**
   * 依存が既定で持っていた振る舞いであって、Marxdown が決めたことではない
   * （[ADR-0009](../../docs/adr/0009-editor-engine-monaco.md)）。
   * **いまは「振り直さないこと」を留めるためにここに居る。**
   */
  it('途中に挿んでも、続きの番号は触らない', async () => {
    await browser.keys([Key.Control, Key.Home]);
    await browser.keys([Key.End]);
    await browser.keys([Key.Enter]);

    await browser.waitUntil(async () => (await editorText()) === '1. a\n2. \n2. b', {
      timeout: 10_000,
      timeoutMsg: '次の項目が 2. で始まらなかった',
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
