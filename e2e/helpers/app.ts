/**
 * アプリの場所と、開いているインスタンスにファイルを開かせる手段。
 *
 * argv では渡さない。
 * `tauri:options.args` は `ms:edgeOptions.args` へそのまま流れ、msedgedriver が Chromium のスイッチとして解釈するため、実測（2026-08-30）では `args: ['C:\work\doc.md']` は argv に `"--c:\work\doc.md"`（`--` 前置 + 小文字化）として渡り、`args: ['--']` はセッション生成が "argument is empty" で失敗する。
 * つまりこの経路でファイルパスは渡せない。
 * ドライバ側の制約であり、`cli.rs` を変えても解決しない。
 *
 * 代わりに argv 転送を使う。
 * Marxdown は単一インスタンス（[ADR-0004](../../docs/adr/0004-process-model-and-cli.md)）で、2 回目以降の `marxdown foo.md` は新規プロセスを立てずに既存プロセスへ argv を転送する。
 * ドライバが起動した 1 つ目に対して、テストから 2 つ目を叩けばよい。
 * テスト専用の裏口を製品コードに開けずに済むうえ、中心価値そのもの（Warm Start の経路）を毎回通ることになる。
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Key } from 'webdriverio';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * テスト対象の実行ファイル。
 *
 * **`pnpm build:app` で作ったものを使う。** `cargo build --release` 単独だと
 * `dist/` が古いまま埋め込まれ、起動が固まる（measurements/09-caveats.md）。
 */
export const APP = path.resolve(here, '..', '..', 'src-tauri', 'target', 'release', 'marxdown.exe');

/**
 * 起動中のインスタンスに `target` を開かせる。**低レベル。** 普段は `openViaForward` を使う。
 *
 * **待たない。** 転送側のプロセスがシェルを掴んだまま終わらない既知の問題があり
 * （[OQ-32](../../docs/07.open-questions/oq-32-cli-holds-shell.md)）、
 * 終了を待つと E2E ごと止まる。開けたかどうかは画面側で確かめる。
 */
export function forwardOpen(target: string): void {
  const child = spawn(APP, [target], { detached: true, stdio: 'ignore' });
  child.unref();
}

/** シェル（ステータスバー）が描かれるまで待つ。転送を投げてよい最低条件。 */
async function waitForShell(): Promise<void> {
  await browser.waitUntil(() => browser.execute(() => document.querySelector('.mx-statusbar') !== null), {
    timeout: 30_000,
    interval: 100,
    timeoutMsg: 'シェルが描かれなかった',
  });
}

/** 本文に `expected` が現れたか。現れなければ false を返す（投げない）。 */
async function documentAppeared(expected: string, timeout: number): Promise<boolean> {
  try {
    await browser.waitUntil(
      async () => {
        const text = await browser.execute(() => document.querySelector('#mx-preview .mx-content')?.textContent ?? '');
        return text.includes(expected);
      },
      { timeout, interval: 200 },
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * argv 転送でファイルを開き、本文が描かれるまで待つ。
 *
 * 再送するのは、転送は取りこぼされうるためである。
 * `bootstrap.ts` が `onOpenRequest` を購読するのは `ready()` の後で、それより前に届いた転送は聞く相手が居ないまま捨てられる。
 * シェルの描画（`waitForShell`）は `ready()` の手前なので、待っても十分ではない。
 *
 * 製品としては問題にならない。
 * 人が 2 つ目を叩くのは 1 つ目が画面に出た後だからで、ここだけが起動から数十 ms のうちに転送を投げる特殊な使い方になる。
 * 製品側に順序の保証を足すより、テスト側で再送するほうが釣り合う。
 */
export async function openViaForward(target: string, expected: string): Promise<void> {
  await waitForShell();

  for (let attempt = 1; attempt <= 3; attempt++) {
    forwardOpen(target);
    if (await documentAppeared(expected, 10_000)) return;
  }

  throw new Error(`argv 転送で "${target}" が開かなかった（3 回試行）`);
}

/* ------------------------------------------------------------------ */
/* 編集と保存（M2 Phase 2）                                             */
/* ------------------------------------------------------------------ */

/** いまの表示モード（`features/view/mode.ts` が `<html>` に立てる）。 */
export async function currentMode(): Promise<string> {
  return browser.execute(() => document.documentElement.dataset['mxMode'] ?? '');
}

/* ------------------------------------------------------------------ */
/* エディタの DOM（エンジン固有）                                       */
/* ------------------------------------------------------------------ */

/**
 * エディタが吐く DOM を指すセレクタ。**エンジンの名前が書いてよいのはここだけ。**
 *
 * spec 側に散ると、[ADR-0009](../../docs/adr/0009-editor-engine-monaco.md) の差し替えで 4 ファイルを同時に直すことになる。
 * この表 1 枚と、下の薄い関数群を書き換えれば済む状態にしてある。
 * CodeMirror → Monaco の張り替えで書き換えたのはこの範囲だけで、spec の期待値は 1 つも動かしていない。
 *
 * すべて `#mx-editor` の内側に閉じる。
 * `.monaco-editor` はもう 1 つあり、はみ出すウィジェットの受け皿として `document.body` 直下にも同じクラスの要素を置いているため（`features/editor/editor.ts`）、素のクラス名で数えると載っていないのに 1 つあることになる。
 *
 * `browser.execute` に渡す関数は文字列化されて向こう側で走るので、
 * **セレクタはクロージャで掴まず引数で渡す。**
 */
export const EDITOR_DOM = {
  /** エディタの外枠。載っているかの判定に使う。 */
  root: '#mx-editor .monaco-editor',
  /** 編集面。クリックしてフォーカスを取る先。 */
  content: '#mx-editor .view-lines',
  /** 1 行。**DOM の順は行の順ではない**（`editorText`）。 */
  line: '#mx-editor .view-line',
  /** カーソル。どの行に居るかを位置で結ぶのに使う。 */
  cursor: '#mx-editor .cursors-layer .cursor',
  /** スクロールする中身。**位置は `style.top` に負で入る**（`editorScrollTop`）。 */
  linesContent: '#mx-editor .lines-content',
  /** 検索・置換ウィジェット。**開いているときだけ `visible` が付く。** */
  findWidget: '#mx-editor .find-widget.visible',
  /** 検索欄のまとまり。フォーカスがどちらの欄にあるかを見る。 */
  findPart: '.find-part',
  /** 置換欄のまとまり。 */
  replacePart: '.replace-part',
} as const;

/** 載っているエディタの数。Preview だけで読んでいるときは 0。 */
export async function mountedEditorCount(): Promise<number> {
  return browser.execute((selector: string) => document.querySelectorAll(selector).length, EDITOR_DOM.root);
}

/** 遅延チャンクの取得と評価を待つ。**ここが失敗するなら分割が壊れている。** */
export async function waitForEditorMounted(): Promise<void> {
  await browser.waitUntil(async () => (await mountedEditorCount()) === 1, {
    // **Monaco は CodeMirror より待つ。** raw 3.0MB の評価が入る（ADR-0009 の根拠 2）。
    timeout: 30_000,
    timeoutMsg: 'エディタが載らなかった',
  });
}

/** 編集面をクリックしてフォーカスを取る。 */
export async function focusEditorSurface(): Promise<void> {
  await $(EDITOR_DOM.content).click();
}

/** 編集面の素のテキスト。**行区切りは入らない**（載ったことの確認に使う）。 */
export async function editorContentText(): Promise<string> {
  return browser.execute(
    (selector: string) => (document.querySelector(selector)?.textContent ?? '').replaceAll('\u{A0}', ' '),
    EDITOR_DOM.content,
  );
}

/**
 * エディタが持っている本文。改行はエディタの行区切りから組み直す。
 *
 * DOM の順に読んではいけない。
 * Monaco は行の要素を使い回すため、スクロールすると中身だけが差し替わるので `querySelectorAll` の順は画面の上から下の順とは限らない。
 * 位置（`style.top`）で並べ直す。
 * CodeMirror では DOM の順がそのまま行の順だったので、張り替えで中身が変わったのはこの関数である（返すものは変えていない）。
 *
 * 空白は元に戻す。
 * Monaco は空白を `&nbsp;`（U+00A0）で描くため、素の `textContent` で突き合わせると見た目が同じなのに一致しないという形で落ちる。
 * タブは `tabSize` ぶんの空白に展開して描かれるので元には戻せない（spec はタブを打たない。`Tab` が入れるのは空白 / `features/editor/list.ts`）。
 *
 * 見えている行しか無い。
 * 仮想化されているので、長い本文では画面の外の行が入らない。
 * この関数を使う spec は短い本文だけを扱っている。
 */
export async function editorText(): Promise<string> {
  return browser.execute(
    (selector: string) =>
      [...document.querySelectorAll(selector)]
        .map((element) => ({
          // eslint-disable-next-line unicorn/prefer-number-coercion -- `20px` の単位を落とすために必要
          top: Number.parseFloat((element as HTMLElement).style.top) || 0,
          text: (element.textContent ?? '').replaceAll('\u{A0}', ' '),
        }))
        .toSorted((a, b) => a.top - b.top)
        .map((entry) => entry.text)
        .join('\n'),
    EDITOR_DOM.line,
  );
}

/**
 * カーソルがある行の文字列。
 *
 * **カーソルと行は位置で結ぶ。** Monaco の「現在行」は本文とは別の重ね描き
 * （`.view-overlays`）にあって文字列を持たない。どちらも同じ `style.top` を
 * 持つので、そこで突き合わせる。
 */
export async function activeLineText(): Promise<string> {
  return browser.execute(
    (lineSelector: string, cursorSelector: string) => {
      const cursor = document.querySelector(cursorSelector);
      if (!(cursor instanceof HTMLElement)) return '';
      const found = [...document.querySelectorAll(lineSelector)].find(
        (element) => (element as HTMLElement).style.top === cursor.style.top,
      );
      return (found?.textContent ?? '').replaceAll('\u{A0}', ' ');
    },
    EDITOR_DOM.line,
    EDITOR_DOM.cursor,
  );
}

/** 検索・置換ウィジェットが出ているか。 */
export async function isSearchPanelOpen(): Promise<boolean> {
  return browser.execute((selector: string) => document.querySelectorAll(selector).length === 1, EDITOR_DOM.findWidget);
}

/**
 * 検索ウィジェットの、いまフォーカスがある欄。どちらでもなければ空文字。
 *
 * **`name` 属性では引けない。** Monaco の入力欄は素の `<input>` で、
 * 区別できるのは囲んでいるまとまり（`.find-part` / `.replace-part`）だけである。
 */
export async function focusedFindField(): Promise<string> {
  return browser.execute(
    (findPart: string, replacePart: string) => {
      const active = document.activeElement;
      if (!(active instanceof Element)) return '';
      if (active.closest(replacePart)) return 'replace';
      if (active.closest(findPart)) return 'search';
      return '';
    },
    EDITOR_DOM.findPart,
    EDITOR_DOM.replacePart,
  );
}

/**
 * エディタのスクロール位置。器が無ければ `-1`。
 *
 * **`scrollTop` では読めない。** Monaco の器は `overflow: hidden` で、
 * スクロールは中身を上へずらして表している
 * （`viewLines.js` の `_linesContent.setTop(-adjustedScrollTop)`）。
 * **符号を反転して読む。**
 *
 * `adjusted` は桁が大きいとき（数百万 px）の丸め対策で、spec が扱う長さでは 0。
 */
export async function editorScrollTop(): Promise<number> {
  return browser.execute((selector: string) => {
    const element = document.querySelector(selector);
    if (!(element instanceof HTMLElement)) return -1;
    // eslint-disable-next-line unicorn/prefer-number-coercion -- `-200px` の単位を落とすために必要
    return -(Number.parseFloat(element.style.top) || 0);
  }, EDITOR_DOM.linesContent);
}

/**
 * エディタを端まで動かす。**キーで動かす。**
 *
 * CodeMirror のときは器の `scrollTop` へ代入していたが、
 * **Monaco はその値を見ていない**（`editorScrollTop` の但し書き）。
 * 代入しても画面は動かず `onDidScrollChange` も飛ばないので、同期の検証にならない。
 *
 * ここで見たいのは「動かしたら反対側が追随するか」であって「何 px 動いたか」では
 * ないので、端まで飛ばせば足りる。**本物の打鍵**なので、キーが届くことも同時に通る。
 */
export async function scrollEditorToEnd(): Promise<void> {
  await focusEditorSurface();
  await browser.keys([Key.Control, Key.End]);
}

/** エディタを先頭へ戻す。 */
export async function scrollEditorToTop(): Promise<void> {
  await focusEditorSurface();
  await browser.keys([Key.Control, Key.Home]);
}

/* ------------------------------------------------------------------ */
/* 編集の操作                                                          */
/* ------------------------------------------------------------------ */

/** Edit モードに入り、エディタが載るまで待つ。 */
export async function enterEditMode(): Promise<void> {
  if ((await currentMode()) === 'edit') return;

  await browser.keys([Key.Control, Key.Shift, 'v']);
  await browser.waitUntil(async () => (await currentMode()) === 'edit', {
    timeout: 20_000,
    timeoutMsg: 'Edit へ切り替わらなかった',
  });
  await waitForEditorMounted();
}

/** エディタの末尾に文字を打つ。**実際のキー入力**で入れる（IME を除く本番の経路）。 */
export async function typeAtEnd(text: string): Promise<void> {
  await focusEditorSurface();
  await browser.keys([Key.Control, 'End']);
  await browser.keys(text);
}

/** 未保存の印（`●` / 03.ux-spec/07-status-and-notifications.md §1）が出ているか。 */
export async function isDirtyShown(): Promise<boolean> {
  return browser.execute(() => document.querySelector('.mx-titlebar__dirty') !== null);
}

/** 保存する。**印が消えるまで待つ**（保存できた唯一の見える合図）。 */
export async function saveAndWaitClean(): Promise<void> {
  await browser.keys([Key.Control, 's']);
  await browser.waitUntil(async () => !(await isDirtyShown()), {
    timeout: 20_000,
    timeoutMsg: '保存しても未保存の印が消えなかった',
  });
}

/** 通知バーの文言。出ていなければ空文字。 */
export async function noticeText(): Promise<string> {
  return browser.execute(() => document.querySelector('.mx-notice')?.textContent ?? '');
}

/**
 * 通知バーのボタンを文言で押す。
 *
 * WebdriverIO の `button=文言` セレクタは、このドライバでは
 * `invalid selector` で通らない。DOM 側で探して押す。
 */
export async function clickNoticeAction(label: string): Promise<void> {
  await browser.waitUntil(
    () =>
      browser.execute((text: string) => {
        const button = [...document.querySelectorAll('.mx-notice__action')].find(
          (el) => (el.textContent ?? '').trim() === text,
        );
        if (!(button instanceof HTMLElement)) return false;
        button.click();
        return true;
      }, label),
    { timeout: 10_000, timeoutMsg: `通知バーに「${label}」が無い` },
  );
}

/** 通知バーに `needle` を含む文言が出るまで待つ。 */
export async function waitForNotice(needle: string): Promise<void> {
  await browser.waitUntil(
    async () => {
      const text = await noticeText();
      return text.includes(needle);
    },
    { timeout: 20_000, timeoutMsg: `通知バーに「${needle}」が出なかった` },
  );
}

/** エディタの本文に `needle` が現れるまで待つ。 */
export async function waitForEditorText(needle: string): Promise<void> {
  await browser.waitUntil(
    async () => {
      const text = await editorText();
      return text.includes(needle);
    },
    { timeout: 20_000, timeoutMsg: `エディタに「${needle}」が現れなかった` },
  );
}
