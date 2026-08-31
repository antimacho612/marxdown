/**
 * アプリの場所と、**開いているインスタンスにファイルを開かせる手段**。
 *
 * # なぜ argv で渡さないのか
 *
 * `tauri:options.args` は `ms:edgeOptions.args` へそのまま流れ、
 * msedgedriver が **Chromium のスイッチとして**解釈する。実測（2026-08-30）:
 *
 * ```text
 * args: ['C:\work\doc.md']  → argv に "--c:\work\doc.md"（`--` 前置 + 小文字化）
 * args: ['--']                → セッション生成が "argument is empty" で失敗
 * ```
 *
 * つまり**この経路でファイルパスは渡せない**。ドライバ側の制約であり、
 * `cli.rs` を変えても解決しない。
 *
 * # 代わりに argv 転送を使う
 *
 * Marxdown は単一インスタンス（[ADR-0004](../../docs/adr/0004-process-model-and-cli.md)）で、
 * 2 回目以降の `marxdown foo.md` は**新規プロセスを立てずに既存プロセスへ argv を転送する**。
 * ドライバが起動した 1 つ目に対して、テストから 2 つ目を叩けばよい。
 *
 * テスト専用の裏口を製品コードに開けずに済むうえ、
 * **中心価値そのもの（Warm Start の経路）を毎回通ることになる。**
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
 * # 再送する理由
 *
 * **転送は取りこぼされうる。** `bootstrap.ts` が `onOpenRequest` を購読するのは
 * `ready()` の**後**で、それより前に届いた転送は聞く相手が居ないまま捨てられる。
 * シェルの描画（`waitForShell`）は `ready()` の手前なので、待っても十分ではない。
 *
 * 製品としては問題にならない。人が 2 つ目を叩くのは 1 つ目が画面に出た後だからで、
 * ここだけが**起動から数十 ms のうちに転送を投げる**特殊な使い方になる。
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
 * エディタが吐く DOM を指すセレクタ。**`.cm-*` が書いてよいのはここだけ。**
 *
 * spec 側にエンジンの名前が散ると、[ADR-0009](../../docs/adr/0009-editor-engine-monaco.md) の
 * 差し替えで 4 ファイルを同時に直すことになる。**この表 1 枚と、下の薄い関数群を
 * 書き換えれば済む**状態にしてある。
 *
 * `browser.execute` に渡す関数は文字列化されて向こう側で走るので、
 * **セレクタはクロージャで掴まず引数で渡す。**
 */
export const EDITOR_DOM = {
  /** エディタの外枠。載っているかの判定に使う。 */
  root: '.cm-editor',
  /** 編集面。クリックしてフォーカスを取る先。 */
  content: '.cm-content',
  /** 1 行。本文の組み直しに使う。 */
  line: '.cm-line',
  /** カーソルがある行。 */
  activeLine: '.cm-line.cm-activeLine',
  /** スクロールする器。Split の同期で位置を読み書きする。 */
  scroller: '.cm-scroller',
  /** 検索・置換パネル。 */
  searchPanel: '.cm-panel.cm-search',
} as const;

/** 載っているエディタの数。Preview だけで読んでいるときは 0。 */
export async function mountedEditorCount(): Promise<number> {
  return browser.execute((selector: string) => document.querySelectorAll(selector).length, EDITOR_DOM.root);
}

/** 遅延チャンクの取得と評価を待つ。**ここが失敗するなら分割が壊れている。** */
export async function waitForEditorMounted(): Promise<void> {
  await browser.waitUntil(async () => (await mountedEditorCount()) === 1, {
    timeout: 20_000,
    timeoutMsg: 'エディタが載らなかった',
  });
}

/** 編集面をクリックしてフォーカスを取る。 */
export async function focusEditorSurface(): Promise<void> {
  await $(EDITOR_DOM.content).click();
}

/** 編集面の素のテキスト。**行区切りは入らない**（載ったことの確認に使う）。 */
export async function editorContentText(): Promise<string> {
  return browser.execute((selector: string) => document.querySelector(selector)?.textContent ?? '', EDITOR_DOM.content);
}

/** カーソルがある行の文字列。 */
export async function activeLineText(): Promise<string> {
  return browser.execute(
    (selector: string) => document.querySelector(selector)?.textContent ?? '',
    EDITOR_DOM.activeLine,
  );
}

/** 検索・置換パネルが出ているか。 */
export async function isSearchPanelOpen(): Promise<boolean> {
  return browser.execute(
    (selector: string) => document.querySelectorAll(selector).length === 1,
    EDITOR_DOM.searchPanel,
  );
}

/** エディタのスクロール位置。器が無ければ `-1`。 */
export async function editorScrollTop(): Promise<number> {
  return browser.execute((selector: string) => document.querySelector(selector)?.scrollTop ?? -1, EDITOR_DOM.scroller);
}

/** エディタのスクロール位置を動かす。**同期は `scroll` で動くので代入で足りる。** */
export async function setEditorScrollTop(top: number): Promise<void> {
  await browser.execute(
    (selector: string, to: number) => {
      const element = document.querySelector(selector);
      if (element) element.scrollTop = to;
    },
    EDITOR_DOM.scroller,
    top,
  );
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

/** エディタが持っている本文。改行はエディタの行区切りから組み直す。 */
export async function editorText(): Promise<string> {
  return browser.execute(
    (content: string, line: string) =>
      [...document.querySelectorAll(`${content} ${line}`)].map((element) => element.textContent ?? '').join('\n'),
    EDITOR_DOM.content,
    EDITOR_DOM.line,
  );
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
